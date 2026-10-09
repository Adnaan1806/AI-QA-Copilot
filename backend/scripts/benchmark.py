"""
Benchmark the automation agents on a project's requirements, so a change to an
agent can be judged against numbers instead of a feeling.

Two modes:
  approved  Automate each requirement's approved test cases from scratch (no
            saved script is replayed). Measures the Explorer, Codegen and Healer.
  fresh     Analyse each requirement and generate new test cases (not saved),
            then automate all of them. Measures the whole pipeline, including
            how well the QA agent's steps match the real app.

Nothing is written to the database; traces are not saved. Each case runs the
real LLM and a real browser, so a run takes a while. Results are saved after
each requirement, so a run that stops early still leaves what it finished.
Token counts come from the claude CLI; with another provider they read 0.

Run from backend/ with the venv active:
    PYTHONPATH=. python scripts/benchmark.py --project "Playwright.dev Smoke" --mode approved
    PYTHONPATH=. python scripts/benchmark.py --compare benchmarks/a.json benchmarks/b.json
"""

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

RESULTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "benchmarks")


class RecordingExplorer:
    """Passes through to the real Explorer and keeps the trace it returned."""

    def __init__(self, explorer):
        self._explorer = explorer
        self.trace = None

    def explore(self, test_case, base_url):
        self.trace = self._explorer.explore(test_case, base_url)
        return self.trace


def usage_totals(calls):
    return {
        "llm_calls": len(calls),
        "input_tokens": sum(c["input_tokens"] for c in calls),
        "output_tokens": sum(c["output_tokens"] for c in calls),
        # What the calls would cost on the API; a subscription isn't billed per call.
        "cost_usd": round(sum(c["cost_usd"] for c in calls), 4),
    }


def acceptance_criteria_count(text):
    """Bullet or numbered lines after an "Acceptance criteria" heading; 0 if none."""
    lines = text.splitlines()
    start = next((i for i, line in enumerate(lines) if "acceptance criteria" in line.lower()), None)
    if start is None:
        return 0
    return sum(1 for line in lines[start + 1:] if re.match(r"\s*([-*\u2022]|\d+[.)])\s+\S", line))


def case_result(requirement, test_case, outcome, trace, seconds, calls=()):
    tries = outcome.get("tries") or []
    dead_ends = (trace or {}).get("dead_ends", [])
    return {
        "requirement": requirement,
        "title": test_case.get("title", ""),
        "steps": len(test_case.get("steps", [])),
        "status": outcome["status"],
        "tries": len(tries),
        "healed": sum(1 for t in tries if t["kind"] == "healed"),
        "gave_up": any(t.get("stop_reason") for t in tries),
        "stop_reason": next((t["stop_reason"] for t in tries if t.get("stop_reason")), None),
        "dead_ends": len(dead_ends),
        "dead_end_steps": [d.get("step_text", "") for d in dead_ends],
        # Timed out or crashed partway; see last_output.
        "stopped": (outcome.get("last_output") or "").startswith("Automation stopped"),
        "error": outcome.get("error"),
        "seconds": round(seconds, 1),
        **usage_totals(list(calls)),
    }


def errored_case(requirement, test_case, exc, seconds, calls=()):
    """A case the benchmark itself couldn't finish, recorded instead of ending the run."""
    outcome = {"status": "error", "tries": [], "error": f"{type(exc).__name__}: {str(exc)[:300]}"}
    return case_result(requirement, test_case, outcome, None, seconds, calls)


def summarize(cases, requirements=()):
    total = len(cases)
    if not total:
        return {"cases": 0}
    passed = [c for c in cases if c["status"] == "passed"]
    steps = sum(c["steps"] for c in cases)
    criteria = sum(r.get("acceptance_criteria", 0) for r in requirements)
    calls = sum(c.get("llm_calls", 0) for c in cases)
    return {
        "cases": total,
        "cases_per_criterion": round(total / criteria, 2) if criteria else None,
        "passed": len(passed),
        "passed_first_try": sum(1 for c in passed if c["tries"] == 1),
        "passed_after_healing": sum(1 for c in passed if c["tries"] > 1),
        # Passed although the Explorer couldn't carry out a step: the script
        # likely checks less than the case describes.
        "passed_despite_dead_ends": sum(1 for c in passed if c["dead_ends"]),
        "needs_review": sum(1 for c in cases if c["status"] == "needs_review"),
        "stopped": sum(1 for c in cases if c.get("stopped")),
        "errors": sum(1 for c in cases if c["status"] == "error"),
        "healing_gave_up": sum(1 for c in cases if c["gave_up"]),
        "steps": steps,
        "dead_end_steps": sum(c["dead_ends"] for c in cases),
        "dead_end_rate": round(sum(c["dead_ends"] for c in cases) / steps, 3) if steps else 0,
        "mean_tries": round(sum(c["tries"] for c in cases) / total, 2),
        "mean_seconds": round(sum(c["seconds"] for c in cases) / total, 1),
        "llm_calls": calls,
        "mean_llm_calls": round(calls / total, 1),
        "mean_input_tokens": round(sum(c.get("input_tokens", 0) for c in cases) / total),
        "mean_output_tokens": round(sum(c.get("output_tokens", 0) for c in cases) / total),
        "cost_usd": round(sum(c.get("cost_usd", 0) for c in cases), 2),
    }


# Lower is better for these; higher is better for the rest except NEUTRAL.
LOWER_IS_BETTER = {
    "needs_review", "stopped", "errors", "passed_despite_dead_ends", "healing_gave_up",
    "dead_end_steps", "dead_end_rate", "mean_tries", "mean_seconds",
    "llm_calls", "mean_llm_calls", "mean_input_tokens", "mean_output_tokens", "cost_usd",
}
NEUTRAL = {"cases", "steps", "cases_per_criterion"}


def compare(before, after):
    rows = []
    for key, old in before["summary"].items():
        new = after["summary"].get(key)
        if not isinstance(old, (int, float)) or not isinstance(new, (int, float)):
            continue
        delta = round(new - old, 3)
        better = delta < 0 if key in LOWER_IS_BETTER else delta > 0
        mark = "" if delta == 0 or key in NEUTRAL else (" better" if better else " worse")
        rows.append(f"{key:22} {old:>8} -> {new:<8} ({delta:+}){mark}")
    return "\n".join(rows)


def load_requirements(project_name, only):
    from app.database.connection import SessionLocal
    from app.database.models import Project
    from app.services.automation_service import test_case_payload

    db = SessionLocal()
    projects = db.query(Project).filter_by(name=project_name).all()
    if len(projects) != 1:
        sys.exit(f"Expected one project named {project_name!r}, found {len(projects)}")
    project = projects[0]
    if not project.base_url:
        sys.exit("The project has no base URL")

    requirements = []
    for suite in project.test_suites:
        for req in suite.requirements:
            if only and not any(o.lower() in req.name.lower() for o in only):
                continue
            approved = [tc for tc in req.test_cases if tc.status == "approved"]
            requirements.append(
                {
                    "name": req.name,
                    "content": req.content,
                    "acceptance_criteria": acceptance_criteria_count(req.content),
                    # No id: the executor then keeps no trace, so real traces aren't overwritten.
                    "cases": [{**test_case_payload(tc), "id": ""} for tc in approved],
                }
            )
    db.close()
    return project.id, project.base_url, requirements


def generate_cases(requirement, project_id):
    from app.orchestration.graph import analysis_qa_graph
    from app.rag.retriever import retrieve

    result = analysis_qa_graph.invoke(
        {"requirement_text": requirement["content"], "context": retrieve(requirement["content"], project_id)}
    )
    return [
        {
            "id": "",
            "title": item.get("title", ""),
            "type": item.get("type", "functional"),
            "steps": item.get("steps", []),
            "expected_result": item.get("expected_result", ""),
            "priority": item.get("priority", "medium"),
        }
        for item in result["test_cases"]
    ]


def run(project_name, mode, only, save=lambda result: None):
    from app import config
    from app.automation.runner import automate_test_case
    from app.llm.claude_cli_client import take_usage
    from app.orchestration import graph

    project_id, base_url, requirements = load_requirements(project_name, only)

    def run_one(job):
        requirement, test_case = job
        take_usage()  # this thread's calls from an earlier case
        explorer = RecordingExplorer(graph._explorer_agent)
        started = time.monotonic()
        try:
            outcome = automate_test_case(test_case, base_url, explorer, graph._codegen_agent)
            result = case_result(
                requirement, test_case, outcome, explorer.trace, time.monotonic() - started, take_usage()
            )
        except Exception as exc:
            result = errored_case(requirement, test_case, exc, time.monotonic() - started, take_usage())
        print(
            f"  {result['status']:12} {result['tries']} tries  {result['dead_ends']} dead ends  "
            f"{result['llm_calls']} LLM calls  {test_case['title']}",
            flush=True,
        )
        return result

    result = {
        "project": project_name,
        "mode": mode,
        "run_at": datetime.now().isoformat(timespec="seconds"),
        "requirements": [],
        "summary": {},
        "cases": [],
    }
    for requirement in requirements:
        entry = {"name": requirement["name"], "acceptance_criteria": requirement["acceptance_criteria"]}
        result["requirements"].append(entry)
        if mode == "fresh":
            take_usage()
            try:
                test_cases = generate_cases(requirement, project_id)
            except Exception as exc:
                entry["error"] = f"generating cases failed: {type(exc).__name__}: {str(exc)[:300]}"
                print(f"{requirement['name']}: {entry['error']}", flush=True)
                continue
            finally:
                entry["generation"] = usage_totals(take_usage())
        else:
            test_cases = requirement["cases"]
        entry["cases"] = len(test_cases)
        print(f"{requirement['name']}: {len(test_cases)} cases", flush=True)
        jobs = [(requirement["name"], tc) for tc in test_cases]
        with ThreadPoolExecutor(max_workers=config.AUTOMATION_CONCURRENCY) as executor:
            result["cases"].extend(executor.map(run_one, jobs))
        result["summary"] = summarize(result["cases"], result["requirements"])
        save(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project", help="project name")
    parser.add_argument("--mode", choices=["approved", "fresh"], default="approved")
    parser.add_argument("--only", nargs="*", help="only requirements whose name contains one of these")
    parser.add_argument("--label", default="", help="added to the result file name, e.g. baseline")
    parser.add_argument("--compare", nargs=2, metavar=("BEFORE", "AFTER"), help="compare two result files")
    args = parser.parse_args()

    if args.compare:
        before, after = (json.load(open(path, encoding="utf-8")) for path in args.compare)
        print(compare(before, after))
        return
    if not args.project:
        parser.error("--project is required unless --compare is given")

    os.makedirs(RESULTS_DIR, exist_ok=True)
    name = "-".join(filter(None, [datetime.now().strftime("%Y%m%d-%H%M"), args.mode, args.label]))
    path = os.path.join(RESULTS_DIR, f"{name}.json")

    def save(result):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

    result = run(args.project, args.mode, args.only, save)
    save(result)
    print(json.dumps(result["summary"], indent=2))
    print(f"Saved {path}")


if __name__ == "__main__":
    main()
