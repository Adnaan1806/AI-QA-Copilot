"""
Adds analysis_results.analyst_turns: how the Analyst checked a requirement
(each tool call and what it returned), shown as "How the Analyst checked".

Table creation in this project is Base.metadata.create_all() only (see
app/main.py), which does not retrofit new columns onto existing tables --
this one-off script does that via raw ALTER TABLE, following the same
direct-engine-access pattern as scripts/migrate_automation_v2.py.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/migrate_analyst_turns.py
"""

from sqlalchemy import text

from app.database.connection import engine

STATEMENTS = [
    "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS analyst_turns JSON",
]


def main():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Running: {statement}")
            conn.execute(text(statement))
    print("Migration complete.")


if __name__ == "__main__":
    main()
