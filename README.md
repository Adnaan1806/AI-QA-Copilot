# AI QA Copilot

An AI QA engineer for your app: submit a requirement, get back a risk
analysis, AI-generated test cases, real browser automation, and a
release-readiness report.

## Features

- **Requirement analysis** — submit a requirement (text or PDF) and get
  structured requirements, risks, missing information, and testing
  considerations.
- **AI-generated test cases** — functional, negative, edge-case, and
  security cases, grounded via RAG against a QA knowledge base you upload
  (past test cases, bug reports, business rules).
- **Human review** — edit, approve, add, or delete test cases before
  anything gets automated.
- **Real browser automation** — for each approved test case, a real
  headless (or headed) browser is driven step by step to ground actual
  working locators, which are then turned into a pytest-playwright script.
  Failing scripts self-heal using real pytest failure output, up to 3
  attempts. Test cases automate concurrently, not one at a time.
- **Targeted reruns** — rerun automation for a single test case (e.g. one
  marked "needs review") without regenerating everything else.
- **Release-readiness report** — a summary, coverage analysis, quality
  risks, and a release recommendation, grounded in exact test/automation
  counts.
- **Swappable LLM provider** — Gemini (default, pay-per-token API key) or
  Claude (shells out to a locally logged-in `claude` CLI, riding your
  Claude Code subscription instead of a separate API key). Switch via
  `LLM_PROVIDER` in `.env`.

See [TEST_GENERATION_APPROACH.md](TEST_GENERATION_APPROACH.md) for how the
generation pipeline works, and
[AI-QA-COPILOT-ROADMAP.md](AI-QA-COPILOT-ROADMAP.md) for the original vision
and what's still ahead.

## Backend

```
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in GEMINI_API_KEY and DATABASE_URL (or set LLM_PROVIDER=claude)
uvicorn app.main:app --reload
```

Requires a running PostgreSQL instance matching `DATABASE_URL` in `.env`.
Tables are created automatically on startup.

`.env` is only read once, at process start — after changing it, restart the
backend (`--reload` watches `.py` files, not `.env`).

API docs: http://localhost:8000/docs

## Frontend

```
cd frontend
npm install
npm run dev
```

Runs at http://localhost:5173, expects the backend at http://localhost:8000.
