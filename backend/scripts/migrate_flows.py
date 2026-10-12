"""
Merges workflows learned before flows existed -- one per passing test case,
keyed by the case's id -- into flows: cases that took the same path through
the app share one (see app/services/workflow_service.py). Updates Postgres and
the vector store together. Safe to re-run: flows already merged are left alone.

Don't run while a benchmark runs: it writes to the vector store.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/migrate_flows.py
"""

from app.database.connection import SessionLocal
from app.database.models import KnowledgeFact, Project
from app.services.fact_service import forget_facts
from app.services.workflow_service import add_case_to_flow


def main():
    db = SessionLocal()
    try:
        for project in db.query(Project).all():
            old = [
                f for f in db.query(KnowledgeFact).filter_by(project_id=project.id, kind="workflow").all()
                if not f.key.startswith("flow:")
            ]
            for fact in old:
                content = dict(fact.content)
                case = {"id": content.get("test_case_id") or fact.key, "title": fact.title}
                forget_facts(db, [fact])
                db.flush()
                add_case_to_flow(db, project, case, content["start_url"], content["steps"], content.get("healed", False))
            if old:
                flows = db.query(KnowledgeFact).filter_by(project_id=project.id, kind="workflow").count()
                print(f"{project.name}: {len(old)} workflows -> {flows} flows")
        db.commit()
    finally:
        db.close()
    print("Migration complete.")


if __name__ == "__main__":
    main()
