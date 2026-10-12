"""
Adds what the QA agent reports when it drafts from the app's knowledge:
analysis_results.open_questions (where the requirement and the app disagree)
and test_cases.assumptions (labels a case relies on that the app map didn't show).

Table creation in this project is Base.metadata.create_all() only (see
app/main.py), which does not retrofit new columns onto existing tables --
this one-off script does that via raw ALTER TABLE, following the same
direct-engine-access pattern as scripts/migrate_automation_v2.py.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/migrate_app_knowledge.py
"""

from sqlalchemy import text

from app.database.connection import engine

STATEMENTS = [
    "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS open_questions JSON",
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS assumptions JSON",
]


def main():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Running: {statement}")
            conn.execute(text(statement))
    print("Migration complete.")


if __name__ == "__main__":
    main()
