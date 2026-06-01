from datetime import datetime
from sqlmodel import Session
from src.models.stock import StockConsensus

async def run_market_pipeline(ticker: str, session: Session) -> StockConsensus:
    # Standardize ticker inputs to avoid duplication checks
    clean_ticker = ticker.upper().strip()

    # DAY 1 MOCK LOGIC: Bypass active scraping loops
    mock_consensus = StockConsensus(
        ticker=clean_ticker,
        aggregate_sentiment="Mildly Bullish",
        average_sentiment_score=0.45,
        the_bull_case="Mocked data indicates high sequential chip design demand expansion.",
        the_bear_case="Supply constraints continue to limit shorter term shipment visibility metrics.",
        consensus_risk_level="Medium",
        raw_source_meta=[{"source": "Mock Financial Feed", "weight": 1.0}],
        fetched_at=datetime.utcnow()
    )

    # Persist objects directly down into SQLite
    session.add(mock_consensus)
    session.commit()
    session.refresh(mock_consensus)
    
    return mock_consensus