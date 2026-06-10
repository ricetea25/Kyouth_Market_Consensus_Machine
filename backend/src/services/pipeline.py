import asyncio
import json
import os
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from google import genai
from google.genai import types
from sqlmodel import Session

from src.config import settings
from src.models.stock import StockConsensus
from src.schemas.ai.market_analysis import (
    MarketAnalysis,
    build_unavailable_analysis,
)
from src.services.market_movement import build_market_movement


ai_client = genai.Client(api_key=settings.gemini_api_key)
TICKER_PATTERN = re.compile(r"^[A-Z]{1,5}(\.[A-Z])?$")
ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query"


def _provider_message(payload: dict[str, Any]) -> str | None:
    for key in ("Error Message", "Information", "Note"):
        if payload.get(key):
            return str(payload[key])
    return None


async def _fetch_alpha_vantage(
    client: httpx.AsyncClient,
    params: dict[str, str],
) -> dict[str, Any]:
    response = await client.get(ALPHA_VANTAGE_URL, params=params)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Market-data provider returned an invalid response.")
    return payload


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

    api_key = settings.alpha_vantage_api_key
    fundamental_params = {
        "function": "OVERVIEW",
        "symbol": clean_ticker,
        "apikey": api_key,
    }
    news_params = {
        "function": "NEWS_SENTIMENT",
        "tickers": clean_ticker,
        "sort": "LATEST",
        "limit": "25",
        "apikey": api_key,
    }
    price_params = {
        "function": "TIME_SERIES_DAILY",
        "symbol": clean_ticker,
        "outputsize": "compact",
        "apikey": api_key,
    }

    raw_fundamentals: dict[str, Any] = {}
    raw_news: dict[str, Any] = {}
    raw_prices: dict[str, Any] = {}
    provider_errors = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            raw_fundamentals = await _fetch_alpha_vantage(client, fundamental_params)
            provider_message = _provider_message(raw_fundamentals)
            if "Error Message" in raw_fundamentals or not raw_fundamentals:
                raise ValueError(
                    f"Invalid ticker symbol: '{clean_ticker}' does not exist or has no data."
                )
            if provider_message:
                provider_errors.append(f"fundamentals: {provider_message}")
        except ValueError:
            raise
        except Exception as error:
            provider_errors.append(f"fundamentals: {error}")

        await asyncio.sleep(1.5)
        try:
            raw_news = await _fetch_alpha_vantage(client, news_params)
            if provider_message := _provider_message(raw_news):
                provider_errors.append(f"news: {provider_message}")
                raw_news = {}
            elif not raw_news.get("feed"):
                provider_errors.append("news: no articles were returned")
                raw_news = {}
        except Exception as error:
            provider_errors.append(f"news: {error}")

        await asyncio.sleep(1.5)
        try:
            raw_prices = await _fetch_alpha_vantage(client, price_params)
            if provider_message := _provider_message(raw_prices):
                provider_errors.append(f"prices: {provider_message}")
                raw_prices = {}
            elif not raw_prices.get("Time Series (Daily)"):
                provider_errors.append("prices: no daily history was returned")
                raw_prices = {}
        except Exception as error:
            provider_errors.append(f"prices: {error}")

    market_movement = build_market_movement(
        raw_prices,
        raw_news,
        clean_ticker,
    )
    if provider_errors:
        market_movement["provider_errors"] = provider_errors

    prompt = (
        "You are a market risk analyst. Analyze company fundamentals, news sentiment, "
        "and measured price reactions around the supplied news events. Treat event "
        "returns as evidence of association, not proof that a headline caused a move. "
        "Base the market psychology and bull/bear cases on the measured reactions when "
        "they are available.\n\n"
        f"Asset: {clean_ticker}\n\n"
        f"--- FUNDAMENTALS ---\n{str(raw_fundamentals)[:12000]}\n\n"
        f"--- NEWS ---\n{str(raw_news)[:12000]}\n\n"
        f"--- NEWS-TO-PRICE MOVEMENT ---\n{str(market_movement)[:10000]}"
    )

    data_is_partial = bool(provider_errors)
    analysis_status = "partial" if data_is_partial else "complete"
    analysis_error = "; ".join(provider_errors) or None
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
        print("Attempting Ollama llama3.1 fallback...")
        try:
            ollama_response = await asyncio.to_thread(
                lambda: __import__("ollama").generate(
                    model="llama3.1",
                    prompt=(
                        prompt + "\n\nRespond only with valid JSON matching: "
                        "{aggregate_sentiment, average_sentiment_score (0.0-1.0), "
                        "consensus_risk_level, accounting_perspective, "
                        "market_psychology_perspective, key_news_sources (list), "
                        "the_bull_case, the_bear_case}"
                    ),
                )
            )
            raw_text = ollama_response["response"]
            clean_json = raw_text[raw_text.find("{") : raw_text.rfind("}") + 1]
            ai_analysis = MarketAnalysis(**json.loads(clean_json))
            analysis_status = "partial" if data_is_partial else "fallback"
        except Exception as ollama_error:
            analysis_status = "unavailable"
            analysis_error += f"; Ollama failed: {ollama_error}"
            print(f"Ollama fallback also failed: {ollama_error}")
            ai_analysis = build_unavailable_analysis()

    pipeline_data = {
        "ticker": clean_ticker,
        "aggregate_sentiment": ai_analysis.aggregate_sentiment,
        "average_sentiment_score": ai_analysis.average_sentiment_score,
        "accounting_perspective": ai_analysis.accounting_perspective,
        "market_psychology_perspective": ai_analysis.market_psychology_perspective,
        "key_news_sources": ai_analysis.key_news_sources,
        "the_bull_case": ai_analysis.the_bull_case,
        "the_bear_case": ai_analysis.the_bear_case,
        "consensus_risk_level": ai_analysis.consensus_risk_level,
        "market_movement": market_movement,
        "analysis_status": analysis_status,
        "analysis_error": analysis_error,
        "raw_source_meta": [raw_fundamentals, raw_news],
        "fetched_at": datetime.now(timezone.utc),
    }
    return _store_record(session, pipeline_data, existing_record)
