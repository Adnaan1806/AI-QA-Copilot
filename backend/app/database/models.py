import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Text, UniqueConstraint
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    requirement: Mapped["Requirement"] = relationship(back_populates="report")
