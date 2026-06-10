import logging
import re
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlmodel import Session, select

from .config import settings
from .database import get_session, init_db
from .models.stock import StockConsensus
from .services.analysis_coordinator import get_or_create_analysis
from .services.pipeline import run_market_pipeline


logger = logging.getLogger(__name__)
TICKER_PATTERN = re.compile(r"^[A-Z]{1,5}(\.[A-Z])?$")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Sentinel Consensus API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "online", "system": "Kyouth Market Consensus Machine"}


@app.get("/history", response_model=list[StockConsensus])
def get_analysis_history(
    session: Session = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    subquery = (
        select(
            StockConsensus.ticker,
            func.max(StockConsensus.fetched_at).label("max_date"),
        )
        .group_by(StockConsensus.ticker)
        .subquery()
    )
    statement = (
        select(StockConsensus)
        .join(
            subquery,
            (StockConsensus.ticker == subquery.c.ticker)
            & (StockConsensus.fetched_at == subquery.c.max_date),
        )
        .order_by(StockConsensus.fetched_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return session.exec(statement).all()


@app.get("/ticker/{symbol}/history", response_model=list[StockConsensus])
def get_ticker_history(
    symbol: str,
    session: Session = Depends(get_session),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    statement = (
        select(StockConsensus)
        .where(StockConsensus.ticker == symbol.upper())
        .order_by(StockConsensus.fetched_at.asc())
        .offset(offset)
        .limit(limit)
    )
    return session.exec(statement).all()


@app.get("/ticker/{symbol}", response_model=StockConsensus)
async def get_ticker_consensus(
    symbol: str,
    session: Session = Depends(get_session),
):
    clean_symbol = symbol.upper().strip()
    if not TICKER_PATTERN.fullmatch(clean_symbol):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid ticker format: '{clean_symbol}'. Use a standard ticker "
                "such as AAPL, GOOGL, or BRK.B."
            ),
        )

    try:
        return await get_or_create_analysis(
            session,
            clean_symbol,
            run_market_pipeline,
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        logger.exception("Pipeline processing failed for %s", clean_symbol)
        raise HTTPException(
            status_code=500,
            detail="Analysis could not be completed. Please try again later.",
        ) from error
