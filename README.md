# Kyouth_Market_Consensus_Machine

An automated financial intelligence system that combines market fundamentals, live sentiment, and AI synthesis into a Bull vs. Bear consensus dashboard.

## Project Overview

### Problem Statement
Investors and analysts often need to correlate structured company data with unstructured market sentiment, but those signals are usually spread across multiple tools and sources. This project reduces that friction by turning raw market inputs into a single consensus view.

### Target Users
- Retail investors who want a fast summary of a stock.
- Analysts who want a lightweight synthesis layer over fundamentals and news.
- Developers who need a local, containerized market-analysis demo.

### System Goal
Provide a simple web app that fetches market data for a ticker, runs AI-driven synthesis, stores the result, and presents a readable bullish/bearish consensus with supporting evidence.

## System Architecture

### Data Flow

```mermaid
flowchart LR
  A[User enters ticker in frontend] --> B[Next.js frontend]
  B --> C[FastAPI backend /ticker/{symbol}]
  C --> D[Validate ticker and check cache]
  D --> E[Alpha Vantage fundamentals + news]
  E --> F[Gemini synthesis]
  F --> G[SQLite persistence]
  G --> H[JSON response to frontend]
  H --> I[Dashboard, chart, and detail view]
```

Input: ticker symbol from the dashboard or ticker page.

Processing: the backend validates the symbol, checks for cached results, fetches external market data when needed, sends a prompt to Gemini, then stores the structured result in SQLite.

Output: the frontend renders a summary card, sentiment indicators, supporting bull/bear cases, source links, and historical data views.

### Module Breakdown
- `frontend/src/app/page.tsx`: landing page, search flow, dashboard cards, and chart rendering.
- `frontend/src/app/ticker/[symbol]/page.tsx`: detailed ticker view with sentiment summary and analysis sections.
- `backend/src/main.py`: FastAPI routes, cache policy, and request orchestration.
- `backend/src/services/pipeline.py`: Alpha Vantage fetches, Gemini synthesis, and database persistence.
- `backend/src/models/stock.py`: SQLModel schema for stored consensus records.
- `backend/src/database.py`: SQLite engine setup and session dependency.
- `backend/src/config.py`: environment-backed settings.

## Setup & Installation

### Prerequisites
- Docker and Docker Compose.
- Python 3.14 tooling if you want to run the backend locally.
- Node.js 22 if you want to run the frontend locally.
- API keys for Gemini and Alpha Vantage.

### Environment Setup
Create a `.env` file in the repository root and add:

```env
GEMINI_API_KEY=your_gemini_api_key_here
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
```

If you want live API calls in Docker, make sure the mock flag is disabled before starting the stack.

### Run With Docker
Start the full system with:

```bash
make run
```

Stop it with:

```bash
make stop
```

Clean local caches and virtual environments with:

```bash
make clean
```

### Local Development
The Makefile also supports local dependency setup:

```bash
make setup
```

This installs backend dependencies with `uv`, installs frontend dependencies with `npm`, and creates a local `.env` from the example file when available.

### Access Points
- Frontend Dashboard: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Features

- Ticker search and consensus retrieval: users can request a stock symbol and get the latest stored or newly generated analysis.
- Fundamental and sentiment harvesting: the backend queries Alpha Vantage for company overview and news sentiment data.
- AI synthesis: Gemini converts raw market inputs into structured bull and bear perspectives.
- Cached analysis records: recent results are reused for 24 hours to reduce API calls.
- Historical ticker views: the API exposes both latest-per-ticker and full ticker history endpoints.
- Frontend sentiment visualization: the UI normalizes backend responses into readable sentiment, risk, and chart views.
- Local persistence: analysis records are saved in SQLite for later retrieval.

## Technical Decisions

- FastAPI was chosen for a small, explicit backend that keeps request orchestration easy to follow.
- SQLModel and SQLite were used to minimize setup overhead and keep the demo self-contained.
- The backend caches recent results for 24 hours to reduce repeated external calls and improve responsiveness.
- The frontend uses Next.js with client-side charting to keep the dashboard interactive.
- Gemini is used as the synthesis layer rather than trying to hard-code heuristics for sentiment combination.
- The system favors a simple local Docker workflow over a more distributed production deployment, which keeps onboarding easier but limits durability and scale.

## Limitations

- The Docker backend currently runs with mock mode enabled unless the environment flag is changed, so live API behavior depends on configuration.
- The frontend chart can emit a width and height warning when the container is measured before layout settles. The chart often still renders, but the layout needs hardening.
- Alpha Vantage rate limits can still affect live runs even with sequential fetching and caching.
- Gemini failures fall back to a generic analysis object, which keeps the app alive but reduces analysis quality.
- Future improvements include persistent database volumes, explicit production configuration, stronger API error handling, and fixing the chart container sizing issue.

## Database Inspection

The backend container includes `sqlite3`. The default database file is `consensus.db` in the backend working directory, so you can inspect it with:

```bash
docker exec -it <backend_container_name> sqlite3 /app/consensus.db
```
