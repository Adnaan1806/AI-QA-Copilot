import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    projects: Mapped[list["Project"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    base_url: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship(back_populates="projects")
    test_suites: Mapped[list["TestSuite"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    knowledge_documents: Mapped[list["KnowledgeDocument"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="KnowledgeDocument.created_at.desc()",
    )
    app_crawl: Mapped[Optional["AppCrawl"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", uselist=False
    )
    accounts: Mapped[list["ProjectAccount"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="ProjectAccount.created_at"
    )
    knowledge_facts: Mapped[list["KnowledgeFact"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="KnowledgeFact.title"
    )


class KnowledgeDocument(Base):
    """A document uploaded to a project's knowledge base. Its text lives in the
    vector store as chunks with ids "<document id>-<n>", tagged with project_id
    so retrieval only ever searches the project's own documents."""

    __tablename__ = "knowledge_documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    project: Mapped["Project"] = relationship(back_populates="knowledge_documents")


class TestSuite(Base):
    __tablename__ = "test_suites"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    project: Mapped["Project"] = relationship(back_populates="test_suites")
    requirements: Mapped[list["Requirement"]] = relationship(
        back_populates="suite", cascade="all, delete-orphan"
    )


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    suite_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("test_suites.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    suite: Mapped["TestSuite"] = relationship(back_populates="requirements")
    analysis_result: Mapped["AnalysisResult"] = relationship(
        back_populates="requirement", uselist=False, cascade="all, delete-orphan"
    )
    # Ordered so the UI's case numbers (TC-1, TC-2, ...) stay stable across reloads.
    # Cases drafted together share a created_at, so id breaks the tie.
    test_cases: Mapped[list["TestCase"]] = relationship(
        back_populates="requirement",
        cascade="all, delete-orphan",
        order_by=lambda: (TestCase.created_at, TestCase.id),
    )
    report: Mapped["Report"] = relationship(
        back_populates="requirement", uselist=False, cascade="all, delete-orphan"
    )


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("requirements.id"), nullable=False, unique=True
    )
    requirements: Mapped[list] = mapped_column(JSON, default=list)
    risks: Mapped[list] = mapped_column(JSON, default=list)
    missing_info: Mapped[list] = mapped_column(JSON, default=list)
    testing_considerations: Mapped[list] = mapped_column(JSON, default=list)
    # Extra cases the QA agent drafted but didn't add; a reviewer adds them with one click.
    suggestions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # Where the requirement and what the project knows about its app disagree.
    open_questions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # Question text -> {"status": "answered" | "dismissed", "rule_id", "at"}, for
    # both missing_info and open_questions; answered ones became rules.
    question_answers: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    requirement: Mapped["Requirement"] = relationship(back_populates="analysis_result")


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("requirements.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    test_type: Mapped[str] = mapped_column(Text, nullable=False)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    expected_result: Mapped[str] = mapped_column(Text, nullable=False)
    # The acceptance criterion this case proves, as the QA agent quoted it.
    covers: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Pages, buttons or fields the steps rely on that the app knowledge didn't show.
    assumptions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # How the case starts when its project has accounts: "logged_in",
    # "logged_out", or None to decide from the case (see session_service).
    start_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # The account to start as; None means the project's default.
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("project_accounts.id", ondelete="SET NULL"), nullable=True
    )
    priority: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft")
    # Who approved or rejected the case, and when. Cleared when it returns to draft.
    reviewed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    requirement: Mapped["Requirement"] = relationship(back_populates="test_cases")
    reviewed_by: Mapped[Optional["User"]] = relationship()
    automation_script: Mapped["AutomationScript"] = relationship(
        back_populates="test_case", uselist=False, cascade="all, delete-orphan"
    )
    # Every automation run of this case, newest first; the script row holds only the latest.
    automation_runs: Mapped[list["AutomationRun"]] = relationship(
        back_populates="test_case",
        cascade="all, delete-orphan",
        order_by="AutomationRun.created_at.desc()",
    )


class AutomationScript(Base):
    __tablename__ = "automation_scripts"
    __table_args__ = (UniqueConstraint("test_case_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    test_case_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("test_cases.id"), nullable=False
    )
    framework: Mapped[str] = mapped_column(Text, nullable=False, default="playwright")
    code: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="passed")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trace_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    test_case: Mapped["TestCase"] = relationship(back_populates="automation_script")


class AutomationRun(Base):
    """One execution of a test case's automation, kept so flaky cases can be spotted."""

    __tablename__ = "automation_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    test_case_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("test_cases.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(Text, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Each script run in order: {kind: replayed|generated|healed, passed, code,
    # output, reason}. Null on runs recorded before tries were kept.
    tries: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    test_case: Mapped["TestCase"] = relationship(back_populates="automation_runs")


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (UniqueConstraint("requirement_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("requirements.id"), nullable=False
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    coverage_analysis: Mapped[list] = mapped_column(JSON, default=list)
    quality_risks: Mapped[list] = mapped_column(JSON, default=list)
    release_recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    # One of RELEASE_VERDICTS (see services/automation_service.py); null only on
    # reports written before verdicts were structured and not yet backfilled.
    verdict: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Test case id -> automation status this report was written for; re-runs
    # compare against it to tell whether the report is stale. Null on reports
    # written before it was stored, which are rewritten on their next run.
    case_statuses: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    requirement: Mapped["Requirement"] = relationship(back_populates="report")


class AppCrawl(Base):
    """The project's app-map crawl: its settings and how the last run went."""

    __tablename__ = "app_crawls"
    __table_args__ = (UniqueConstraint("project_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    max_pages: Mapped[int] = mapped_column(Integer, default=30)
    max_depth: Mapped[int] = mapped_column(Integer, default=3)
    # Paths crawled from as well as the base URL, e.g. ["/docs/intro"].
    start_paths: Mapped[list] = mapped_column(JSON, default=list)
    respect_robots: Mapped[bool] = mapped_column(Boolean, default=True)
    # "running", "done" or "failed".
    status: Mapped[str] = mapped_column(Text, default="running")
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # url -> why it wasn't visited, from the last run.
    skipped: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="app_crawl")


# Where a fact came from, and how far the agents may rely on it.
FACT_SOURCES = ("crawler", "explorer", "healer", "reviewer", "chat", "document")
# observed: seen in the app (good for steps, never for expected results).
# proven: a passing test did it. stated: a person said so, not yet checked.
# confirmed: a reviewer confirmed it.
FACT_STATUSES = ("observed", "proven", "stated", "confirmed")


class KnowledgeFact(Base):
    """One thing the project knows about its app: a page, a workflow, a rule.
    Facts accumulate as the crawler, the agents and people add them; each keeps
    its source, status and when it was last seen. Its text form is also in the
    vector store (id "fact-<id>", kind "fact") so agents can retrieve it."""

    __tablename__ = "knowledge_facts"
    __table_args__ = (UniqueConstraint("project_id", "kind", "key"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    # "page" for now; "workflow", "rule", "term", ... as other sources arrive.
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    # Identifies the fact within its kind, so seeing it again updates it (a page's URL).
    key: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, default="")
    # Structured detail, shaped by kind (a page: headings, buttons, fields, ...).
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    project: Mapped["Project"] = relationship(back_populates="knowledge_facts")


class ProjectAccount(Base):
    """A login to the project's app, e.g. "Admin" or "Standard user". The password
    and the saved browser session are encrypted (app/access/secrets.py) and never
    leave the backend: not in API responses, not in LLM prompts."""

    __tablename__ = "project_accounts"
    __table_args__ = (UniqueConstraint("project_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    username: Mapped[str] = mapped_column(Text, nullable=False)
    password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    # Where the login form is; the project's app URL when empty.
    login_url: Mapped[str] = mapped_column(Text, default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    # Playwright storage state after the last successful login, encrypted.
    session_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    project: Mapped["Project"] = relationship(back_populates="accounts")
