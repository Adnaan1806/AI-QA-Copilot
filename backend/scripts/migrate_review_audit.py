"""
Adds review audit fields, run history, and structured release verdicts:

- test_cases.reviewed_by_id / reviewed_at / reject_reason
- reports.verdict, backfilled from each existing report's recommendation text
- automation_runs table, backfilled with one run per existing automation script

Table creation in this project is Base.metadata.create_all() only (see
app/main.py), which does not retrofit new columns onto existing tables --
this one-off script does that via raw ALTER TABLE, following the same
direct-engine-access pattern as scripts/migrate_trace_path.py. It is safe to
run more than once.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/migrate_review_audit.py
"""

import uuid

from sqlalchemy import text

from app.database.connection import engine
from app.database.models import AutomationRun
from app.services.automation_service import normalize_verdict

STATEMENTS = [
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS reviewed_by_id UUID REFERENCES users(id)",
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ",
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS reject_reason TEXT",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS verdict TEXT",
]


def main():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Running: {statement}")
            conn.execute(text(statement))

        AutomationRun.__table__.create(bind=conn, checkfirst=True)

        reports = conn.execute(
            text("SELECT id, release_recommendation FROM reports WHERE verdict IS NULL")
        ).all()
        for report_id, recommendation in reports:
            conn.execute(
                text("UPDATE reports SET verdict = :verdict WHERE id = :id"),
                {"verdict": normalize_verdict(None, recommendation or ""), "id": report_id},
            )
        print(f"Backfilled verdict on {len(reports)} report(s).")

        scripts = conn.execute(
            text(
                "SELECT s.test_case_id, s.status, s.attempts, s.last_output, s.created_at "
                "FROM automation_scripts s "
                "WHERE NOT EXISTS (SELECT 1 FROM automation_runs r WHERE r.test_case_id = s.test_case_id)"
            )
        ).all()
        for test_case_id, status, attempts, output, created_at in scripts:
            conn.execute(
                text(
                    "INSERT INTO automation_runs (id, test_case_id, status, attempts, output, created_at) "
                    "VALUES (:id, :test_case_id, :status, :attempts, :output, :created_at)"
                ),
                {
                    "id": uuid.uuid4(),
                    "test_case_id": test_case_id,
                    "status": status,
                    "attempts": attempts,
                    "output": output,
                    "created_at": created_at,
                },
            )
        print(f"Backfilled {len(scripts)} automation run(s).")
    print("Migration complete.")


if __name__ == "__main__":
    main()
