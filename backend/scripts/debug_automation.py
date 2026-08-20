import sys
import traceback

from dotenv import load_dotenv

load_dotenv()

from app.database.connection import SessionLocal
from app.database.models import Requirement
from app.orchestration.graph import automation_report_graph

requirement_id = sys.argv[1]

db = SessionLocal()
requirement = db.query(Requirement).filter(Requirement.id == requirement_id).first()
if requirement is None:
    raise SystemExit(f"No requirement with id {requirement_id}")

analysis = requirement.analysis_result
approved_payload = [
    {
        "id": str(tc.id),
        "title": tc.title,
        "type": tc.test_type,
        "steps": tc.steps,
        "expected_result": tc.expected_result,
        "priority": tc.priority,
    }
    for tc in requirement.test_cases
]

try:
    result = automation_report_graph.invoke(
        {
            "requirement_id": str(requirement_id),
            "requirement_text": requirement.content,
            "analysis": {
                "requirements": analysis.requirements,
                "risks": analysis.risks,
                "missing_info": analysis.missing_info,
                "testing_considerations": analysis.testing_considerations,
            },
            "approved_test_cases": approved_payload,
            "base_url": requirement.suite.project.base_url,
        }
    )
    print("SUCCESS")
    print(result)
except Exception:
    traceback.print_exc()
finally:
    db.close()
