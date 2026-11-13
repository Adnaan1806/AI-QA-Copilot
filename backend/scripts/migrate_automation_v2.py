"""
Adds columns needed for Automation Agent v2 (browser-grounded generation + self-healing):
  - projects.base_url
  - automation_scripts.status / attempts / last_output

Table creation in this project is Base.metadata.create_all() only (see
app/main.py), which does not retrofit new columns onto existing tables --
this one-off script does that via raw ALTER TABLE, following the same
direct-engine-access pattern as the other migrate_*.py scripts.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/migrate_automation_v2.py
"""

from sqlalchemy import text

from app.database.connection import engine

STATEMENTS = [
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS base_url TEXT DEFAULT ''",
    "ALTER TABLE automation_scripts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'passed'",
    "ALTER TABLE automation_scripts ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 1",
    "ALTER TABLE automation_scripts ADD COLUMN IF NOT EXISTS last_output TEXT",
]


def main():
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"Running: {statement}")
            conn.execute(text(statement))
    print("Migration complete.")


if __name__ == "__main__":
    main()
