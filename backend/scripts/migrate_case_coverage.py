"""
Adds test_cases.covers -- the acceptance criterion a drafted case covers -- and
analysis_results.suggestions -- extra case ideas the QA agent drafted but did
not add, which a reviewer can add with one click.

Table creation in this project is Base.metadata.create_all() only (see
app/main.py), which does not retrofit new columns onto existing tables --
this one-off script does that via raw ALTER TABLE, following the same
direct-engine-access pattern as scripts/migrate_automation_v2.py.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/migrate_case_coverage.py
"""

from sqlalchemy import text

from app.database.connection import engine

STATEMENTS = [
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS covers TEXT",
    "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS suggestions JSON",
]


def main():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Running: {statement}")
            conn.execute(text(statement))
    print("Migration complete.")


if __name__ == "__main__":
    main()
