"""
Adds test_cases.questions: the requirement's open questions each case depends
on, so a question can show the cases it affects and a case its questions.

Table creation in this project is Base.metadata.create_all() only (see
app/main.py), which does not retrofit new columns onto existing tables --
this one-off script does that via raw ALTER TABLE, following the same
direct-engine-access pattern as scripts/migrate_automation_v2.py.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/migrate_case_questions.py
"""

from sqlalchemy import text

from app.database.connection import engine

STATEMENTS = [
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS questions JSON",
]


def main():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Running: {statement}")
            conn.execute(text(statement))
    print("Migration complete.")


if __name__ == "__main__":
    main()
