"""Environment-driven settings, read once at import. See backend/.env.example."""

import os

from dotenv import load_dotenv

load_dotenv()


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is not set -- add it to backend/.env")
    return value


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no")


DATABASE_URL = _required("DATABASE_URL")
SECRET_KEY = _required("SECRET_KEY")

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()
CLAUDE_CLI_PATH = os.environ.get("CLAUDE_CLI_PATH", "claude")

# Set PLAYWRIGHT_HEADLESS=false locally to watch the explorer/executor drive a real browser window.
PLAYWRIGHT_HEADLESS = _flag("PLAYWRIGHT_HEADLESS", default=True)

# Each concurrent slot drives its own real browser (Explorer) and pytest subprocess -- both
# memory/CPU-heavy, so this is capped rather than left unbounded.
AUTOMATION_CONCURRENCY = int(os.environ.get("AUTOMATION_CONCURRENCY", "3"))

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]


def gemini_api_key() -> str:
    return _required("GEMINI_API_KEY")

# Fernet key that encrypts stored app passwords and login sessions. Generate one with
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Without it, accounts can't be saved. Changing it makes stored passwords unreadable.
CREDENTIALS_KEY = os.environ.get("CREDENTIALS_KEY", "")
