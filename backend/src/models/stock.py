from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, JSON
from typing import Dict, Any


class StockConsensus(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ticker: str = Field(index=True)
    aggregate_sentiment: str
    average_sentiment_score: float
    accounting_perspective: str
    market_psychology_perspective: str
    the_bull_case: str
    the_bear_case: str
    consensus_risk_level: str
    key_news_sources: list[str] = Field(default_factory=list, sa_type=JSON)
    market_movement: dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    analysis_status: str = Field(default="complete")
    analysis_error: str | None = None
    # Storing structured JSON data details (Map Phase inputs used)
    raw_source_meta: list[Dict[str, Any]] = Field(default_factory=list, sa_type=JSON)
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
