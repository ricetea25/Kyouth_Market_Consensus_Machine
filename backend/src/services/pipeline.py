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

import re

# 1. Initialize the patched OpenAI client with Instructor
# This wraps the standard OpenAI client with Pydantic validation capabilities
ai_client = genai.Client(api_key=settings.gemini_api_key)

TICKER_PATTERN = re.compile(r'^[A-Z]{1,5}(\.[A-Z])?$')

async def run_market_pipeline(
    ticker: str, 
    session: Session, 
    existing_record: StockConsensus | None = None
) -> StockConsensus:
    
    clean_ticker = ticker.upper().strip()
    
    if not clean_ticker or not TICKER_PATTERN.match(clean_ticker):
        raise ValueError(
            f"Invalid ticker format: '{clean_ticker}'. "
            f"Please use a standard symbol (e.g., 'AAPL', 'GOOGL', or 'BRK.B')."
        )

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

            "accounting_perspective": "Strong balance sheet with a 45% YoY revenue growth. Cash-to-debt ratio remains industry-leading, signaling high resilience against market volatility.",
    		"market_psychology_perspective": "High social volume on X and Reddit indicates a 'fear of missing out' (FOMO) cycle, paired with institutional heavy-buying accumulation patterns.",
            
			"key_news_sources": [
				"https://www.reuters.com/finance/markets/tech-sector-update",
				"https://www.bloomberg.com/news/articles/2026-06-04/market-sentiment-analysis",
				"https://investorplace.com/2026/06/why-nvda-is-leading-the-ai-race"
			],
            
			"accounting_source_url": f"https://www.sec.gov/cgi-bin/browse-edgar?CIK={clean_ticker}&action=getcompany",

            "the_bull_case": "Fundamentals show low debt and low P/E, while active news cycles show heavy retail accumulation.",
            "the_bear_case": "Extremely high social buzz could signal a short-term overbought peak.",
            
			"raw_source_meta": [
				{"provider": "SEC-EDGAR", "status": "200 OK", "data_points": 14},
				{"provider": "AlphaVantage-News", "status": "200 OK", "article_count": 25}
			],
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
                
            if "Error Message" in raw_fundamentals or len(raw_fundamentals.keys()) == 0:
                raise ValueError(f"Invalid ticker symbol: '{clean_ticker}' does not exist or has no data.")
                
        except Exception as e:
            if isinstance(e, ValueError):
                raise e
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
    
    try:
        response = await ai_client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=MarketAnalysis,
            )
        )
        ai_analysis: MarketAnalysis = response.parsed

    #except Exception as ai_error:
        #print(f"⚠️ AI Synthesis Failed for {clean_ticker}: {str(ai_error)}")
        # Generate a safe, structured fallback so the app doesn't crash
        #ai_analysis = MarketAnalysis(
            #aggregate_sentiment="DATA UNAVAILABLE",
            #average_sentiment_score=0.0,
            #consensus_risk_level="UNKNOWN",
            #accounting_perspective="AI processing failed. Unable to synthesize fundamentals at this time.",
            #market_psychology_perspective="AI processing failed. Unable to synthesize news sentiment.",
            #key_news_sources=[],
            #the_bull_case="Analysis temporarily unavailable.",
            #the_bear_case="Analysis temporarily unavailable."
        #)
    except Exception as ai_error:
        print(f"⚠️ Gemini Failed for {clean_ticker}: {str(ai_error)}")
        print(f"🦙 Attempting Ollama llama3.1 fallback...")
        try:
            ollama_response = await asyncio.to_thread(
                lambda: __import__('ollama').generate(
                    model="llama3.1",
                    prompt=prompt + "\n\nRespond ONLY in valid JSON matching this structure: {aggregate_sentiment, average_sentiment_score (0.0-1.0), consensus_risk_level, accounting_perspective, market_psychology_perspective, key_news_sources (list), the_bull_case, the_bear_case}",
                )
            )
            import json
            raw_text = ollama_response['response']
            clean_json = raw_text[raw_text.find('{'):raw_text.rfind('}')+1]
            parsed = json.loads(clean_json)
            ai_analysis = MarketAnalysis(**parsed)
            print(f"✅ Ollama fallback succeeded for {clean_ticker}")
        except Exception as ollama_error:
            print(f"⚠️ Ollama fallback also failed: {str(ollama_error)}")
            ai_analysis = MarketAnalysis(
                aggregate_sentiment="DATA UNAVAILABLE",
                average_sentiment_score=0.0,
                consensus_risk_level="UNKNOWN",
                accounting_perspective="AI processing failed. Unable to synthesize fundamentals at this time.",
                market_psychology_perspective="AI processing failed. Unable to synthesize news sentiment.",
                key_news_sources=[],
                the_bull_case="Analysis temporarily unavailable.",
                the_bear_case="Analysis temporarily unavailable."
            )

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