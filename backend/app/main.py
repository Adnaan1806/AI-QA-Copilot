from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.api.auth import router as auth_router
from app.api.accounts import router as accounts_router
from app.api.questions import router as questions_router
from app.api.app_map import router as app_map_router
from app.api.knowledge import router as knowledge_router
from app.api.projects import router as projects_router
from app.api.requirements import router as requirements_router
from app.api.test_cases import router as test_cases_router
from app.api.test_suites import router as test_suites_router
from app.database.connection import Base, engine
from app.database import models  # noqa: F401 -- registers models on Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Testwright AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(test_suites_router)
app.include_router(requirements_router)
app.include_router(test_cases_router)
app.include_router(knowledge_router)
app.include_router(app_map_router)
app.include_router(accounts_router)
app.include_router(questions_router)


@app.get("/health")
def health():
    return {"status": "ok"}
