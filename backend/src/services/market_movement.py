from bisect import bisect_left
from datetime import datetime
from statistics import fmean
from typing import Any


def _percent_return(start: float, end: float) -> float | None:
    if start <= 0:
        return None
    return round(((end - start) / start) * 100, 2)


def _parse_published_at(value: str) -> datetime | None:
    for date_format in ("%Y%m%dT%H%M%S", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            return datetime.strptime(value, date_format)
        except ValueError:
            continue
    return None


def parse_daily_prices(raw_prices: dict[str, Any]) -> list[dict[str, Any]]:
    time_series = raw_prices.get("Time Series (Daily)", {})
    prices = []

    for date, values in time_series.items():
        try:
            prices.append(
                {
                    "date": date,
                    "close": float(values["4. close"]),
                    "volume": int(values.get("5. volume", 0)),
                }
            )
        except KeyError, TypeError, ValueError:
            continue

    return sorted(prices, key=lambda item: item["date"])


def build_market_movement(
    raw_prices: dict[str, Any],
    raw_news: dict[str, Any],
    ticker: str,
    max_events: int = 10,
) -> dict[str, Any]:
    prices = parse_daily_prices(raw_prices)
    if not prices:
        return {
            "status": "unavailable",
            "reason": "No daily price history was returned by the market-data provider.",
            "trailing_returns": {},
            "news_reactions": [],
        }

    dates = [item["date"] for item in prices]
    latest = prices[-1]
    trailing_returns = {}
    for label, sessions in (("1d", 1), ("5d", 5), ("20d", 20)):
        if len(prices) > sessions:
            trailing_returns[label] = _percent_return(
                prices[-sessions - 1]["close"],
                latest["close"],
            )

    reactions = []
    for article in raw_news.get("feed", []):
        published_at = _parse_published_at(article.get("time_published", ""))
        if not published_at:
            continue

        event_date = published_at.date().isoformat()
        event_index = bisect_left(dates, event_date)
        baseline_index = event_index - 1
        if baseline_index < 0 or event_index >= len(prices):
            continue

        baseline = prices[baseline_index]
        reaction = prices[event_index]
        five_session_index = event_index + 4
        ticker_sentiment = next(
            (
                item
                for item in article.get("ticker_sentiment", [])
                if item.get("ticker", "").upper() == ticker.upper()
            ),
            {},
        )

        event = {
            "title": article.get("title", ""),
            "url": article.get("url", ""),
            "published_at": article.get("time_published", ""),
            "baseline_date": baseline["date"],
            "reaction_date": reaction["date"],
            "return_1d_pct": _percent_return(
                baseline["close"],
                reaction["close"],
            ),
            "provider_sentiment_score": _safe_float(
                ticker_sentiment.get("ticker_sentiment_score")
            ),
        }
        if five_session_index < len(prices):
            event["return_5d_pct"] = _percent_return(
                baseline["close"],
                prices[five_session_index]["close"],
            )

        reactions.append(event)
        if len(reactions) >= max_events:
            break

    one_day_returns = [
        event["return_1d_pct"]
        for event in reactions
        if event.get("return_1d_pct") is not None
    ]
    five_day_returns = [
        event["return_5d_pct"]
        for event in reactions
        if event.get("return_5d_pct") is not None
    ]

    return {
        "status": "complete",
        "latest_price": latest["close"],
        "latest_price_date": latest["date"],
        "trailing_returns": trailing_returns,
        "news_reaction_summary": {
            "events_measured": len(reactions),
            "average_1d_return_pct": _mean_or_none(one_day_returns),
            "average_5d_return_pct": _mean_or_none(five_day_returns),
            "positive_1d_reaction_ratio": _positive_ratio(one_day_returns),
        },
        "news_reactions": reactions,
        "methodology": (
            "Each article is compared with the prior trading close. The 1d reaction "
            "uses the first trading close on or after publication; the 5d reaction "
            "uses the fifth available trading close."
        ),
    }


def _safe_float(value: Any) -> float | None:
    try:
        return round(float(value), 4)
    except TypeError, ValueError:
        return None


def _mean_or_none(values: list[float]) -> float | None:
    return round(fmean(values), 2) if values else None


def _positive_ratio(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(value > 0 for value in values) / len(values), 2)
