from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Run database initialization
    init_db()
    yield
    # Shutdown: Code here runs when the server stops (optional)

# Initialize FastAPI with the lifespan handler
app = FastAPI(title="Sentinel Consensus API", lifespan=lifespan)

# Allow the Next.js frontend to talk to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "online", "system": "Kyouth Market Consensus Machine"}