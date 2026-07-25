# AI QA Copilot — Phase 1

Requirement Analyzer Agent: submit a requirement (text or PDF) and get back
structured requirements, risks, missing information, and testing
considerations.

## Backend

```
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in GEMINI_API_KEY and DATABASE_URL
uvicorn app.main:app --reload
```

Requires a running PostgreSQL instance matching `DATABASE_URL` in `.env`.
Tables are created automatically on startup.

API docs: http://localhost:8000/docs

## Frontend

```
cd frontend
npm install
npm run dev
```

Runs at http://localhost:5173, expects the backend at http://localhost:8000.
