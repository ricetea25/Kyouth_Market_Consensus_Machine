# Set up local developer environments (for IDE autocomplete and local testing)
setup:
	@echo "=== Setting up Backend (uv) ==="
	cd backend && uv sync
	@echo "=== Setting up Frontend (npm) ==="
	cd frontend && npm install
	@echo "=== Configuring Environment Variables ==="
	cp -n .env.example .env || true
	@echo "Setup complete! You can now run 'make run'"

# Start the Docker Compose stack
run:
	docker compose up --build

# Stop the Docker Compose stack
stop:
	docker compose down

# Clean up local environments and cache
clean:
	rm -rf backend/.venv frontend/node_modules frontend/.next
	find . -type d -name "__pycache__" -exec rm -rf {} +
	@echo "Cleaned up virtual environments and cached files."

.PHONY: setup run clean dev-backend dev-frontend