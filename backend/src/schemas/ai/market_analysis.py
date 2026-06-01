from pydantic import BaseModel, Field
from typing import Literal

class MarketAnalysis(BaseModel):
    aggregate_sentiment: Literal["Strong Bearish", "Mildly Bearish", "Neutral", "Mildly Bullish", "Strong Bullish"] = Field(
        description="The overall consolidated market sentiment category based on the sources analyzed."
    )
    average_sentiment_score: float = Field(
        description="A normalized score from 0.0 (completely bearish) to 1.0 (completely bullish)."
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