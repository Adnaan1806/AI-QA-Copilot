"""
Adds reports.case_statuses -- the test case id -> automation status map the
report was written for. Re-runs compare against it to decide whether the
report is stale, so rejecting or deleting a case also refreshes the report.
Reports written before this column existed keep it null and are rewritten on
their next run.

Table creation in this project is Base.metadata.create_all() only (see
app/main.py), which does not retrofit new columns onto existing tables --
this one-off script does that via raw ALTER TABLE, following the same
direct-engine-access pattern as scripts/migrate_automation_v2.py.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/migrate_report_statuses.py
"""

from sqlalchemy import text

from app.database.connection import engine

STATEMENTS = [
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS case_statuses JSON",
]


def main():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Running: {statement}")
            conn.execute(text(statement))
    print("Migration complete.")


if __name__ == "__main__":
    main()
