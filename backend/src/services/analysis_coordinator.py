import asyncio
from weakref import WeakKeyDictionary
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator, Awaitable, Callable

from sqlmodel import Session, select

from src.models.stock import StockConsensus


CACHE_TTLS = {
    "complete": timedelta(hours=24),
    "fallback": timedelta(hours=24),
    "partial": timedelta(hours=1),
    "unavailable": timedelta(0),
}

_ticker_locks_by_loop: WeakKeyDictionary[
    asyncio.AbstractEventLoop, dict[str, asyncio.Lock]
] = WeakKeyDictionary()


def get_latest_analysis(
    session: Session,
    ticker: str,
) -> StockConsensus | None:
    statement = (
        select(StockConsensus)
        .where(StockConsensus.ticker == ticker)
        .order_by(StockConsensus.fetched_at.desc())
    )
    return session.exec(statement).first()


def is_fresh_analysis(
    record: StockConsensus | None,
    now: datetime | None = None,
) -> bool:
    if record is None:
        return False

    ttl = CACHE_TTLS.get(record.analysis_status, timedelta(0))
    if ttl <= timedelta(0):
        return False

    current_time = now or datetime.now(timezone.utc)
    fetched_at = record.fetched_at
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)

    return current_time - fetched_at < ttl


@asynccontextmanager
async def ticker_analysis_lock(ticker: str) -> AsyncIterator[None]:
    loop = asyncio.get_running_loop()
    ticker_locks = _ticker_locks_by_loop.setdefault(loop, {})
    lock = ticker_locks.setdefault(ticker, asyncio.Lock())
    async with lock:
        yield


AnalysisRunner = Callable[[str, Session], Awaitable[StockConsensus]]


async def get_or_create_analysis(
    session: Session,
    ticker: str,
    runner: AnalysisRunner,
) -> StockConsensus:
    latest_record = get_latest_analysis(session, ticker)
    if is_fresh_analysis(latest_record):
        return latest_record

    async with ticker_analysis_lock(ticker):
        # Another request may have completed while this request waited.
        session.expire_all()
        latest_record = get_latest_analysis(session, ticker)
        if is_fresh_analysis(latest_record):
            return latest_record

        return await runner(ticker, session)
