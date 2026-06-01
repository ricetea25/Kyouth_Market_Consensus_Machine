from pydantic import BaseModel, Field

class MarketConsensusSchema(BaseModel):
    aggregate_sentiment: str = Field(description="Must be one of: Strongly Bullish, Mildly Bullish, Neutral, Mildly Bearish, Strongly Bearish")
    average_sentiment_score: float = Field(description="Calculated balance index ranging from -1.0 to 1.0")
    the_bull_case: str = Field(description="Synthesized summary arguments detailing positive technical growth aspects")
    the_bear_case: str = Field(description="Synthesized summary arguments highlighting fundamental downside risks")
    consensus_risk_level: str = Field(description="Risk categorizations: Low, Medium, High")