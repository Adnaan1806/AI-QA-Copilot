"""
Adds how a test case starts when its project has accounts:
test_cases.start_state ("logged_in", "logged_out", or null for automatic) and
test_cases.account_id (which account; null means the project's default).

Table creation in this project is Base.metadata.create_all() only (see
app/main.py), which does not retrofit new columns onto existing tables --
this one-off script does that via raw ALTER TABLE, following the same
direct-engine-access pattern as scripts/migrate_automation_v2.py.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/migrate_case_start.py
"""

from sqlalchemy import text

from app.database.connection import engine

STATEMENTS = [
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS start_state TEXT",
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS account_id UUID "
    "REFERENCES project_accounts(id) ON DELETE SET NULL",
]


def main():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Running: {statement}")
            conn.execute(text(statement))
    print("Migration complete.")


if __name__ == "__main__":
    main()
