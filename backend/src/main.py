# src/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from sqlalchemy import func

from .database import init_db, get_session
from .models.stock import StockConsensus
from .services.analysis_coordinator import (
    get_or_create_analysis,
)
from .services.pipeline import run_market_pipeline

import re

from pydantic import BaseModel
from google import genai as google_genai
from google.genai import types as google_types
from .config import settings

class ChatRequest(BaseModel):
    question: str
    context: str


# ==========================================
# 1. LIFESPAN & APP INITIALIZATION
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Run database initialization
    init_db()
    yield
    # Shutdown: Clean up resources here if needed

app = FastAPI(title="Sentinel Consensus API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 2. ROUTES
# ==========================================

@app.get("/health")
def health_check():
    return {"status": "online", "system": "Kyouth Market Consensus Machine"}

@app.get("/history", response_model=list[StockConsensus])
def get_analysis_history(session: Session = Depends(get_session)):
    # Group by ticker to only get the absolute latest record for the landing page dashboard
    subquery = select(
        StockConsensus.ticker, 
        func.max(StockConsensus.fetched_at).label("max_date")
    ).group_by(StockConsensus.ticker).subquery()

    statement = select(StockConsensus).join(
        subquery, 
        (StockConsensus.ticker == subquery.c.ticker) & 
        (StockConsensus.fetched_at == subquery.c.max_date)
    ).order_by(StockConsensus.fetched_at.desc())
    
    return session.exec(statement).all()

@app.get("/ticker/{symbol}/history", response_model=list[StockConsensus])
def get_ticker_history(symbol: str, session: Session = Depends(get_session)):
    # Pulls all historical records for this specific ticker, ordered chronologically
    statement = select(StockConsensus).where(StockConsensus.ticker == symbol.upper()).order_by(StockConsensus.fetched_at.asc())
    return session.exec(statement).all()

TICKER_PATTERN = re.compile(r'^[A-Z]{1,5}(\.[A-Z])?$')

@app.get("/ticker/{symbol}", response_model=StockConsensus)
async def get_ticker_consensus(symbol: str, session: Session = Depends(get_session)):
    clean_symbol = symbol.upper().strip()
    
    if not TICKER_PATTERN.match(clean_symbol):
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid ticker format: '{clean_symbol}'. Please use a standard ticker format (e.g., 'AAPL', 'GOOGL', or 'BRK.B')."
        )
    try:
        return await get_or_create_analysis(
            session,
            clean_symbol,
            run_market_pipeline,
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline processing failed: {str(e)}")
    
    # ==========================================
# 3. CHAT ENDPOINT
# ==========================================

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        chat_client = google_genai.Client(api_key=settings.gemini_api_key)
        
        system_prompt = f"""You are Sentinel AI, a concise financial intelligence assistant.
You ONLY answer questions based on the Sentinel analysis data provided below.
If asked about a ticker not in the data, say you haven't analysed it yet and suggest running an analysis.
Keep answers under 150 words. Use bullet points where appropriate.
Never give financial advice — always say "based on Sentinel's analysis" not "you should buy/sell".
Always cite which ticker's data you're referencing.

ANALYSED STOCK DATA:
{request.context}"""

        response = await chat_client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"{system_prompt}\n\nUser question: {request.question}",
            config=google_types.GenerateContentConfig(max_output_tokens=300),
        )
        
        return {"response": response.text}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")