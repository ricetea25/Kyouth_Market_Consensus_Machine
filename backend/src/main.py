from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import init_db

app = FastAPI(title="Sentinel Consensus API")

# Allow the Next.js frontend to talk to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    # This will create consensus.db and the tables when the server starts
    init_db()

@app.get("/health")
def health_check():
    return {"status": "online", "system": "Kyouth Market Consensus Machine"}