import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx


ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query"


class InvalidTickerError(ValueError):
    pass


@dataclass
class MarketDataBundle:
    fundamentals: dict[str, Any] = field(default_factory=dict)
    news: dict[str, Any] = field(default_factory=dict)
    prices: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    @property
    def is_partial(self) -> bool:
        return bool(self.errors)

    def source_urls(self, limit: int = 5) -> list[str]:
        urls = []
        for article in self.news.get("feed", []):
            url = article.get("url")
            if isinstance(url, str) and url.startswith(("https://", "http://")):
                if url not in urls:
                    urls.append(url)
            if len(urls) >= limit:
                break
        return urls

    def metadata(self) -> list[dict[str, Any]]:
        daily_prices = self.prices.get("Time Series (Daily)", {})
        return [
            {
                "provider": "AlphaVantage-Fundamentals",
                "status": "available" if self.fundamentals else "unavailable",
                "data_points": len(self.fundamentals),
            },
            {
                "provider": "AlphaVantage-News",
                "status": "available" if self.news else "unavailable",
                "article_count": len(self.news.get("feed", [])),
            },
            {
                "provider": "AlphaVantage-Prices",
                "status": "available" if daily_prices else "unavailable",
                "daily_points": len(daily_prices),
            },
        ]


async def _fetch(
    client: httpx.AsyncClient,
    params: dict[str, str],
) -> dict[str, Any]:
    response = await client.get(ALPHA_VANTAGE_URL, params=params)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Market-data provider returned an invalid response.")
    return payload


def _provider_message(payload: dict[str, Any]) -> str | None:
    for key in ("Error Message", "Information", "Note"):
        if payload.get(key):
            return str(payload[key])
    return None


async def fetch_market_data(ticker: str, api_key: str) -> MarketDataBundle:
    bundle = MarketDataBundle()
    requests = (
        (
            "fundamentals",
            {"function": "OVERVIEW", "symbol": ticker, "apikey": api_key},
        ),
        (
            "news",
            {
                "function": "NEWS_SENTIMENT",
                "tickers": ticker,
                "sort": "LATEST",
                "limit": "25",
                "apikey": api_key,
            },
        ),
        (
            "prices",
            {
                "function": "TIME_SERIES_DAILY",
                "symbol": ticker,
                "outputsize": "compact",
                "apikey": api_key,
            },
        ),
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        for index, (name, params) in enumerate(requests):
            if index:
                await asyncio.sleep(1.5)
            try:
                payload = await _fetch(client, params)
                message = _provider_message(payload)
                if message:
                    if name == "fundamentals" and "Error Message" in payload:
                        raise InvalidTickerError(
                            f"Invalid ticker symbol: '{ticker}' does not exist or has no data."
                        )
                    bundle.errors.append(f"{name}: {message}")
                    continue

                if name == "fundamentals" and not payload:
                    raise InvalidTickerError(
                        f"Invalid ticker symbol: '{ticker}' does not exist or has no data."
                    )
                if name == "news" and not payload.get("feed"):
                    bundle.errors.append("news: no articles were returned")
                    continue
                if name == "prices" and not payload.get("Time Series (Daily)"):
                    bundle.errors.append("prices: no daily history was returned")
                    continue

                setattr(bundle, name, payload)
            except InvalidTickerError:
                raise
            except Exception as error:
                bundle.errors.append(f"{name}: {error}")

    return bundle
