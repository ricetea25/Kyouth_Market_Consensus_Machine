# src/main.py
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from sqlalchemy import func

from .database import init_db, get_session
from .models.stock import StockConsensus
from .services.pipeline import run_market_pipeline

import re

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
    # 1. Get the MOST RECENT record for this ticker (ORDER BY fetched_at DESC)
    statement = select(StockConsensus).where(
        StockConsensus.ticker == clean_symbol
    ).order_by(StockConsensus.fetched_at.desc())
    
    latest_record = session.exec(statement).first()
    
    if latest_record:
        now_utc = datetime.now(timezone.utc)
        fetched_at = latest_record.fetched_at.replace(tzinfo=timezone.utc) if latest_record.fetched_at.tzinfo is None else latest_record.fetched_at
        
        age = now_utc - fetched_at
        
        # If it's less than 24 hours old, return the cached version
        if age < timedelta(hours=24):
            return latest_record
            
        print(f"Data for {clean_symbol} is stale ({age.total_seconds() / 3600:.1f} hours old). Generating new historical point...")

    # 2. Trigger Pipeline to create a BRAND NEW row
    try:
        # Notice we removed `existing_record=latest_record`! 
        # This forces the pipeline to INSERT a new row instead of UPDATE.
        fresh_analysis = await run_market_pipeline(clean_symbol, session)
        return fresh_analysis
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline processing failed: {str(e)}")