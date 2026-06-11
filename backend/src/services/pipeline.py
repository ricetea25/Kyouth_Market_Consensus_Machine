import os
import re
from datetime import datetime, timezone
from typing import Any

from google import genai
from google.genai import types
from ollama import AsyncClient
from sqlmodel import Session

from src.config import settings
from src.models.stock import StockConsensus
from src.schemas.ai.market_analysis import (
    MarketAnalysis,
    build_unavailable_analysis,
)
from src.services.market_data import fetch_market_data
from src.services.market_movement import build_market_movement


ai_client = genai.Client(api_key=settings.gemini_api_key)
ollama_client = AsyncClient(host=settings.ollama_host)
TICKER_PATTERN = re.compile(r"^[A-Z]{1,5}(\.[A-Z])?$")


async def _generate_qwen_analysis(prompt: str) -> MarketAnalysis:
    response = await ollama_client.generate(
        model=settings.ollama_model,
        prompt=(
            prompt + "\n\nReturn only the requested structured analysis. "
            "Do not invent facts that are absent from the supplied evidence."
        ),
        format=MarketAnalysis.model_json_schema(),
        options={"temperature": 0.1},
    )
    return MarketAnalysis.model_validate_json(response.response)


def _store_record(
    session: Session,
    pipeline_data: dict[str, Any],
    existing_record: StockConsensus | None = None,
) -> StockConsensus:
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


async def run_market_pipeline(
    ticker: str,
    session: Session,
    existing_record: StockConsensus | None = None,
) -> StockConsensus:
    clean_ticker = ticker.upper().strip()
    if not clean_ticker or not TICKER_PATTERN.match(clean_ticker):
        raise ValueError(
            f"Invalid ticker format: '{clean_ticker}'. "
            "Please use a standard symbol (e.g., 'AAPL', 'GOOGL', or 'BRK.B')."
        )

    if os.getenv("MOCK_EXTERNAL_APIs") == "true":
        print(f"[MOCK] Bypassing Alpha Vantage and AI calls for {clean_ticker}...")
        pipeline_data = {
            "ticker": clean_ticker,
            "aggregate_sentiment": "Strong Bullish",
            "average_sentiment_score": 0.92,
            "confidence_score": 0.88,
            "consensus_risk_level": "Low",
            "accounting_perspective": (
                "Strong balance sheet with 45% year-over-year revenue growth and "
                "an industry-leading cash-to-debt ratio."
            ),
            "market_psychology_perspective": (
                "High social volume indicates a momentum cycle alongside "
                "institutional accumulation."
            ),
            "key_news_sources": [
                "https://www.reuters.com/finance/markets/tech-sector-update",
                "https://www.bloomberg.com/news/articles/market-sentiment-analysis",
            ],
            "the_bull_case": (
                "Fundamentals are resilient and recent news events were followed by "
                "positive price reactions."
            ),
            "the_bear_case": (
                "Elevated attention and momentum may leave the stock vulnerable to "
                "a short-term reversal."
            ),
            "market_movement": {
                "status": "mock",
                "latest_price": 192.40,
                "latest_price_date": datetime.now(timezone.utc).date().isoformat(),
                "trailing_returns": {"1d": 1.2, "5d": 3.8, "20d": 7.1},
                "news_reaction_summary": {
                    "events_measured": 3,
                    "average_1d_return_pct": 1.4,
                    "average_5d_return_pct": 3.2,
                    "positive_1d_reaction_ratio": 0.67,
                },
                "news_reactions": [],
            },
            "analysis_status": "complete",
            "analysis_error": None,
            "raw_source_meta": [
                {"provider": "AlphaVantage-Fundamentals", "status": "mock"},
                {"provider": "AlphaVantage-News", "status": "mock"},
                {"provider": "AlphaVantage-Prices", "status": "mock"},
            ],
            "fetched_at": datetime.now(timezone.utc),
        }
        return _store_record(session, pipeline_data, existing_record)

    market_data = await fetch_market_data(
        clean_ticker,
        settings.alpha_vantage_api_key,
    )
    market_movement = build_market_movement(
        market_data.prices,
        market_data.news,
        clean_ticker,
    )
    if market_data.errors:
        market_movement["provider_errors"] = market_data.errors

    prompt = (
        "You are a market risk analyst. Analyze company fundamentals, news sentiment, "
        "and measured price reactions around the supplied news events. Treat event "
        "returns as evidence of association, not proof that a headline caused a move. "
        "Base the market psychology and bull/bear cases on the measured reactions when "
        "they are available.\n\n"
        f"Asset: {clean_ticker}\n\n"
        f"--- FUNDAMENTALS ---\n{str(market_data.fundamentals)[:12000]}\n\n"
        f"--- NEWS ---\n{str(market_data.news)[:12000]}\n\n"
        f"--- NEWS-TO-PRICE MOVEMENT ---\n{str(market_movement)[:10000]}"
    )

    data_is_partial = market_data.is_partial
    analysis_status = "partial" if data_is_partial else "complete"
    analysis_error = "; ".join(market_data.errors) or None
    try:
        response = await ai_client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=MarketAnalysis,
            ),
        )
        if response.parsed is None:
            raise ValueError("Gemini returned no structured analysis.")
        ai_analysis: MarketAnalysis = response.parsed
    except Exception as gemini_error:
        gemini_message = f"Gemini failed: {gemini_error}"
        analysis_error = "; ".join(filter(None, [analysis_error, gemini_message]))
        print(f"Gemini failed for {clean_ticker}: {gemini_error}")
        print(f"Attempting Ollama {settings.ollama_model} fallback...")
        try:
            ai_analysis = await _generate_qwen_analysis(prompt)
            analysis_status = "partial" if data_is_partial else "fallback"
        except Exception as qwen_error:
            analysis_status = "unavailable"
            analysis_error = "; ".join(
                filter(None, [analysis_error, f"Qwen failed: {qwen_error}"])
            )
            print(f"Qwen fallback failed for {clean_ticker}: {qwen_error}")
            ai_analysis = build_unavailable_analysis()

    pipeline_data = {
        "ticker": clean_ticker,
        "aggregate_sentiment": ai_analysis.aggregate_sentiment,
        "average_sentiment_score": ai_analysis.average_sentiment_score,
        "confidence_score": ai_analysis.confidence_score,
        "accounting_perspective": ai_analysis.accounting_perspective,
        "market_psychology_perspective": ai_analysis.market_psychology_perspective,
        "key_news_sources": market_data.source_urls(),
        "the_bull_case": ai_analysis.the_bull_case,
        "the_bear_case": ai_analysis.the_bear_case,
        "consensus_risk_level": ai_analysis.consensus_risk_level,
        "market_movement": market_movement,
        "analysis_status": analysis_status,
        "analysis_error": analysis_error,
        "raw_source_meta": market_data.metadata(),
        "fetched_at": datetime.now(timezone.utc),
    }
    return _store_record(session, pipeline_data, existing_record)
