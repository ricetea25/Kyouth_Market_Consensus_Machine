# Kyouth_Market_Consensus_Machine
An automated financial intelligence pipeline that aggregates multi-source stock news and synthesizes granular sentiment into a structured Bull vs. Bear consensus dashboard.

## Required API Keys

Before running the application, you will need to obtain the following API keys:
1. **Gemini API Key**: Used for AI-driven market analysis. You can get one from [Google AI Studio](https://aistudio.google.com/).
2. **Alpha Vantage API Key**: Used for fetching financial and stock data. You can get a free key from [Alpha Vantage](https://www.alphavantage.co/support/#api-key).

## Setup

1. **Initialize the Environment**:
   Run the setup command to install dependencies and create your `.env` file from the example:
   ```bash
   make setup
   ```

2. **Configure your Keys**:
   Open the newly created `.env` file in the root directory and add your API keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
   ```

## Running the Application

1. **Start the containers** using the Makefile:
   ```bash
   make run
   ```

2. **Access the Application**:
   - **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
   - **Backend API**: [http://localhost:8000](http://localhost:8000)
   - **Interactive API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

## Stopping and Cleaning Up

- To stop the services gracefully, run:
  ```bash
  make stop
  ```
- To clean up cached files and virtual environments, run:
  ```bash
  make clean
  ```

## Database Inspection

The backend container includes `sqlite3`. To inspect the database directly while running:

```bash
# Find your backend container name using: docker ps
docker exec -it <backend_container_name> sqlite3 /app/<your_db_name>.db
```
