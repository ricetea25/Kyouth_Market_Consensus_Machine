from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, JSON
from typing import Dict, Any

class StockConsensus(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ticker: str = Field(index=True, unique=True)
    aggregate_sentiment: str
    average_sentiment_score: float
    the_bull_case: str
    the_bear_case: str
    consensus_risk_level: str
    # Storing structured JSON data details (Map Phase inputs used)
    raw_source_meta: list[Dict[str, Any]] = Field(default=[], sa_type=JSON)
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))