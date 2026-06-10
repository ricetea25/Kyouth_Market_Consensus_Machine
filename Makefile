COMPOSE := docker compose
DB_PATH := backend/src/consensus.db

.DEFAULT_GOAL := help

help:
	@echo "Sentinel development commands"
	@echo "  make setup      Install local backend and frontend dependencies"
	@echo "  make start      Build and start the app in the background"
	@echo "  make run        Alias for make start"
	@echo "  make logs       Follow backend and frontend logs"
	@echo "  make status     Show container status"
	@echo "  make restart    Restart the app"
	@echo "  make stop       Stop and remove the app containers"
	@echo "  make db         Open the host-mounted SQLite database"
	@echo "  make db-schema  Print the host-mounted SQLite schema"
	@echo "  make clean      Remove local dependency and cache directories"

setup:
	@command -v uv >/dev/null || (echo "uv is required: https://docs.astral.sh/uv/" && exit 1)
	@command -v npm >/dev/null || (echo "npm is required." && exit 1)
	@echo "=== Setting up backend ==="
	cd backend && uv sync
	@echo "=== Setting up frontend ==="
	cd frontend && npm install
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env from .env.example"; fi
	@echo "Setup complete. Add your API keys to .env, then run 'make start'."

check-env:
	@command -v docker >/dev/null || (echo "Docker is required." && exit 1)
	@$(COMPOSE) version >/dev/null
	@test -f .env || (echo "Missing .env. Run 'make setup' or copy .env.example to .env." && exit 1)
	@! grep -q '<your_' .env || (echo "Replace the placeholder API keys in .env." && exit 1)
	@test -n "$$(sed -n 's/^GEMINI_API_KEY=//p' .env)" || (echo "GEMINI_API_KEY is missing from .env." && exit 1)
	@test -n "$$(sed -n 's/^ALPHA_VANTAGE_API_KEY=//p' .env)" || (echo "ALPHA_VANTAGE_API_KEY is missing from .env." && exit 1)

start: check-env
	$(COMPOSE) up --build -d
	@echo "Sentinel is starting:"
	@echo "  Frontend: http://localhost:3000"
	@echo "  API docs: http://localhost:8000/docs"
	@echo "Run 'make logs' to follow startup output."

run: start

logs:
	$(COMPOSE) logs -f --tail=100

status:
	$(COMPOSE) ps

restart: stop start

stop:
	$(COMPOSE) down

# The backend/src directory is bind-mounted into the container, so this is the
# same database used by the running backend.
db:
	@command -v sqlite3 >/dev/null || (echo "sqlite3 is required to inspect $(DB_PATH)." && exit 1)
	@test -f $(DB_PATH) || (echo "$(DB_PATH) does not exist yet. Run an analysis first." && exit 1)
	sqlite3 $(DB_PATH)

db-schema:
	@command -v sqlite3 >/dev/null || (echo "sqlite3 is required to inspect $(DB_PATH)." && exit 1)
	@test -f $(DB_PATH) || (echo "$(DB_PATH) does not exist yet. Run an analysis first." && exit 1)
	sqlite3 $(DB_PATH) ".schema stockconsensus"

clean:
	rm -rf backend/.venv frontend/node_modules frontend/.next
	find . -type d -name "__pycache__" -exec rm -rf {} +
	@echo "Cleaned local environments and caches. Database files were preserved."

.PHONY: help setup check-env start run logs status restart stop db db-schema clean
