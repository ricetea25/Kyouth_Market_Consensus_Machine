# src/services/pipeline.py
from datetime import datetime, timezone
import httpx
import openai
import instructor
from sqlmodel import Session

from src.models.stock import StockConsensus
from backend.src.schemas.ai.market_analysis import MarketAnalysis
from src.config import settings  # Assuming this is where your Settings class lives

# 1. Initialize the patched OpenAI client with Instructor
# This wraps the standard OpenAI client with Pydantic validation capabilities
ai_client = instructor.from_openai(openai.AsyncOpenAI(api_key=settings.openai_api_key))

async def run_market_pipeline(
    ticker: str, 
    session: Session, 
    existing_record: StockConsensus | None = None
) -> StockConsensus:
    
    clean_ticker = ticker.upper().strip()

    # =================================================================
    # PHASE 1: DATA SCRAPING / HARVESTING (Example Financial API Call)
    # =================================================================
    async with httpx.AsyncClient() as client:
        # Dummy URL representing your data phase fetch
        # Replace this with your actual financial data URL or scraping function
        financial_url = f"https://api.externalfinance.com/v1/stocks/{clean_ticker}"
        try:
            # Setting a placeholder fallback if your real API key isn't set up yet
            # response = await client.get(financial_url)
            # raw_financial_data = response.json()
            raw_financial_data = {"source": "Mock Financial Feed", "market_status": "active"}
        except Exception:
            raw_financial_data = {"source": "Fallback Feed Data"}

    # =================================================================
    # PHASE 2: STRUCTURED AI GENERATION via Instructor
    # =================================================================
    # Instructor overrides the client to return a Pydantic object directly
    ai_analysis: MarketAnalysis = await ai_client.chat.completions.create(
        model="gpt-4o-mini",  # Highly cost-efficient, great for structured JSON
        response_model=MarketAnalysis,
        messages=[
            {
                "role": "system", 
                "content": "You are an elite financial analyst backend agent. Analyze the provided financial data strings."
            },
            {
                "role": "user", 
                "content": f"Analyze the market consensus metrics for ticker: {clean_ticker}. Raw Data Context: {str(raw_financial_data)}"
            }
        ],
    )

    # =================================================================
    # PHASE 3: DATABASE MAPPING & PERSISTENCE
    # =================================================================
    # Extract values directly from the typed Pydantic object properties safely
    pipeline_data = {
        "ticker": clean_ticker,
        "aggregate_sentiment": ai_analysis.aggregate_sentiment,
        "average_sentiment_score": ai_analysis.average_sentiment_score,
        "the_bull_case": ai_analysis.the_bull_case,
        "the_bear_case": ai_analysis.the_bear_case,
        "consensus_risk_level": ai_analysis.consensus_risk_level,
        "raw_source_meta": [raw_financial_data],
        "fetched_at": datetime.now(timezone.utc)
    }

    if existing_record:
        for key, value in pipeline_data.items():
            setattr(existing_record, key, value)
        db_record = existing_record
    else:
        db_record = StockConsensus(**pipeline_data)
        session.add(db_record)

    session.commit()
    session.refresh(db_record)
    
    return db_record