from typing import Optional
from sqlmodel import SQLModel, Field

class StockConsensus(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    bull_score: float  # e.g., 0 to 100
    bear_score: float  # e.g., 0 to 100
    consensus_summary: str