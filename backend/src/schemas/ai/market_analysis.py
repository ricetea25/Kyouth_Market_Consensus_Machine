from pydantic import BaseModel, Field
from typing import Literal


class MarketAnalysis(BaseModel):
    aggregate_sentiment: Literal[
        "Strong Bearish",
        "Mildly Bearish",
        "Neutral",
        "Mildly Bullish",
        "Strong Bullish",
    ] = Field(
        description="The overall consolidated market sentiment category based on the sources analyzed."
    )
    average_sentiment_score: float = Field(
        ge=0.0,
        le=1.0,
        description="A normalized score from 0.0 (completely bearish) to 1.0 (completely bullish).",
    )
    accounting_perspective: str = Field(
        description="A concise summary detailing balance sheet health, valuation, debt, margins, and earnings quality based on the raw metrics."
    )
    market_psychology_perspective: str = Field(
        description="A concise summary detailing the current public narrative, news buzz, institutional accumulation trends, and market psychology."
    )
    key_news_sources: list[str] = Field(
        description="Extract a list of the top 3 to 5 most important source URLs or author publications that drove your sentiment analysis."
    )
    the_bull_case: str = Field(
        description="A highly concise summary of the primary positive catalysts, growth vectors, and bullish arguments."
    )
    the_bear_case: str = Field(
        description="A highly concise summary of the primary risks, headwinds, and bearish arguments."
    )
    consensus_risk_level: Literal["Low", "Medium", "High"] = Field(
        description="The overall structural risk level identified from the consensus breakdown."
    )


def build_unavailable_analysis() -> MarketAnalysis:
    return MarketAnalysis(
        aggregate_sentiment="Neutral",
        average_sentiment_score=0.5,
        consensus_risk_level="Medium",
        accounting_perspective=(
            "AI synthesis was unavailable, so no reliable accounting conclusion "
            "was generated."
        ),
        market_psychology_perspective=(
            "AI synthesis was unavailable, so no reliable news-sentiment conclusion "
            "was generated."
        ),
        key_news_sources=[],
        the_bull_case="Analysis temporarily unavailable.",
        the_bear_case="Analysis temporarily unavailable.",
    )
