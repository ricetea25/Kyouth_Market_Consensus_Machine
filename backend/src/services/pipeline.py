import os
import asyncio
from datetime import datetime, timezone
import httpx
from sqlmodel import Session

from google import genai
from google.genai import types

from src.models.stock import StockConsensus
from src.schemas.ai.market_analysis import MarketAnalysis
from src.config import settings 

# 1. Initialize the patched OpenAI client with Instructor
# This wraps the standard OpenAI client with Pydantic validation capabilities
ai_client = genai.Client(api_key=settings.gemini_api_key)

async def run_market_pipeline(
    ticker: str, 
    session: Session, 
    existing_record: StockConsensus | None = None
) -> StockConsensus:
    
    clean_ticker = ticker.upper().strip()

    # =================================================================
    # MOCK BYPASS (For Local Testing without hitting API limits)
    # =================================================================
    if os.getenv("MOCK_EXTERNAL_APIs") == "true":
        print(f"[MOCK] Bypassing dual Alpha Vantage + AI calls for {clean_ticker}...")
        
        pipeline_data = {
            "ticker": clean_ticker,
            "aggregate_sentiment": "STRONG BULLISH",
            "average_sentiment_score": 0.92,
            "consensus_risk_level": "LOW",

            "accounting_perspective": "[MOCK] Fundamentals show steady cash generation and low leverage.",
            "market_psychology_perspective": "[MOCK] Public streams show high accumulation waves and social euphoria.",
            
            "the_bull_case": "Fundamentals show low debt and low P/E, while active news cycles show heavy retail accumulation.",
            "the_bear_case": "Extremely high social buzz could signal a short-term overbought peak.",
            "raw_source_meta": [{"source": "Mock Dual Fundamentals & News Engine"}],
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

    # =================================================================
    # PHASE 1: DUAL CONCURRENT DATA HARVESTING (Fundamentals + News)
    # =================================================================
    # Grabbing your Alpha Vantage key from settings
    av_api_key = getattr(settings, "alpha_vantage_api_key", "YOUR_KEY_HERE")
    alpha_vantage_url = "https://www.alphavantage.co/query"
    
    # 1A. Setup Fundamental Data Parameters
    fundamental_params = {
        "function": "OVERVIEW",
        "symbol": clean_ticker,
        "apikey": av_api_key
    }
    
    # 1B. Setup News & Sentiment Data Parameters
    news_params = {
        "function": "NEWS_SENTIMENT",
        "tickers": clean_ticker,
        "sort": "LATEST",
        "limit": "25",  # 25 articles provides a solid context window without overloading tokens
        "apikey": av_api_key
    }

    async with httpx.AsyncClient() as client:
        try:
            # 1. Fetch Fundamentals first
            fundamental_res = await client.get(alpha_vantage_url, params=fundamental_params)
            
            # 2. Pause for 1.5 seconds to bypass the Alpha Vantage rate limiter
            await asyncio.sleep(1.5) 
            
            # 3. Fetch News second
            news_res = await client.get(alpha_vantage_url, params=news_params)
            
            raw_fundamentals = fundamental_res.json() if fundamental_res.status_code == 200 else {}
            raw_news = news_res.json() if news_res.status_code == 200 else {}
            
            # Catch potential free-tier throttling messages
            if "Information" in raw_fundamentals or "Information" in raw_news:
                print("⚠️ Alpha Vantage warning: Free-tier rate limit hit anyway.")
                
        except Exception as e:
            print(f"Failed harvesting external market data: {str(e)}")
            raw_fundamentals, raw_news = {}, {}

    # =================================================================
    # PHASE 2: STRUCTURED AI HYBRID SYNTHESIS via Instructor
    # =================================================================
	 
    prompt = (
        "You are an elite hedge-fund risk officer and market analyst. "
        "Your objective is to analyze a company's hard balance sheet fundamentals "
        "alongside its live public news sentiment to form a complete consensus overview.\n\n"
        f"Synthesize market metrics for asset: {clean_ticker}.\n\n"
        f"--- PERSPECTIVE A: FUNDAMENTAL FINANCIAL ACCOUNTING ---\n{str(raw_fundamentals)}\n\n"
        f"--- PERSPECTIVE B: MARKET PSYCHOLOGY & LIVE HEADLINES ---\n{str(raw_news)[:12000]}" 
    )
    
    response = await ai_client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MarketAnalysis,
        )
    )

    # The SDK automatically maps the JSON back into your Pydantic object here
    ai_analysis: MarketAnalysis = response.parsed

    # =================================================================
    # PHASE 3: DATABASE MAPPING & PERSISTENCE
    # =================================================================
    pipeline_data = {
        "ticker": clean_ticker,
        "aggregate_sentiment": ai_analysis.aggregate_sentiment,
        "average_sentiment_score": ai_analysis.average_sentiment_score,
        
		"accounting_perspective": ai_analysis.accounting_perspective,
        "market_psychology_perspective": ai_analysis.market_psychology_perspective,
        
		"key_news_sources": ai_analysis.key_news_sources,
        
		"accounting_source_url": f"https://www.sec.gov/cgi-bin/browse-edgar?CIK={clean_ticker}&action=getcompany",
        
        "the_bull_case": ai_analysis.the_bull_case,
        "the_bear_case": ai_analysis.the_bear_case,
        "consensus_risk_level": ai_analysis.consensus_risk_level,
        # Persist both sets of raw data for your own debugging/frontend needs
        "raw_source_meta": [raw_fundamentals, raw_news],
        "fetched_at": datetime.now(timezone.utc)
    }

    if existing_record:
        # Update existing cached record
        for key, value in pipeline_data.items():
            setattr(existing_record, key, value)
        db_record = existing_record
    else:
        # Create brand new record
        db_record = StockConsensus(**pipeline_data)
        session.add(db_record)

    session.commit()
    session.refresh(db_record)
    
    return db_record