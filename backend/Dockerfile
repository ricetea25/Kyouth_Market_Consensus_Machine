# Use the official uv python image
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies strictly from the lockfile
COPY uv.lock pyproject.toml /app/
RUN uv sync --frozen --no-install-project --no-dev

# Copy the rest of the application
COPY . /app

# Sync the project itself
RUN uv sync --frozen --no-dev

# Run the FastAPI server in hot-reload mode for dev, adjustable via docker-compose overrides
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
