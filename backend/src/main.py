# src/main.py
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from .database import init_db, get_session
from .models.stock import StockConsensus
from .services.pipeline import run_market_pipeline

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


@app.get("/ticker/{symbol}", response_model=StockConsensus)
async def get_ticker_consensus(symbol: str, session: Session = Depends(get_session)):
    clean_symbol = symbol.upper().strip()
    
    # 1. Check Cache 
    statement = select(StockConsensus).where(StockConsensus.ticker == clean_symbol)
    cached_result = session.exec(statement).first()
    
    if cached_result:
        # Timezone-aware calculation (Modern Python 3.10+)
        now_utc = datetime.now(timezone.utc)
        
        # Ensure cached_result.fetched_at is also timezone-aware 
        # (If your DB driver drops tz info, ensure it's mapped correctly)
        fetched_at = cached_result.fetched_at.replace(tzinfo=timezone.utc) if cached_result.fetched_at.tzinfo is None else cached_result.fetched_at
        
        age = now_utc - fetched_at
        
        if age < timedelta(hours=24):
            return cached_result
        
        # STRATEGY: Instead of deleting, pass the stale object to your pipeline 
        # so it can overwrite its values. This avoids primary key churn.
        # If your pipeline expects to create a brand new object, comment out the lines below
        # and handle deletion cleanly.
        print(f"Data for {clean_symbol} is stale ({age.total_seconds() / 3600:.1f} hours old). Refreshing...")

    # 2. Trigger Generation Pipeline worker if data is missing or stale
    try:
        # Note: Pass `cached_result` (which might be None or a stale object) 
        # into your pipeline so it knows whether to perform an UPDATE or an INSERT.
        fresh_analysis = await run_market_pipeline(clean_symbol, session, existing_record=cached_result)
        return fresh_analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline processing failed: {str(e)}")