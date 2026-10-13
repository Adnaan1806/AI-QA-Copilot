"""What the Analyst can look at while it reads a requirement: what the project
already knows -- its app map (pages and flows from the crawler and from tests
that passed), its uploaded documents, and the rules and terms its team stated.

Everything here is a search of the project's own knowledge: nothing opens the
app, so analysing a requirement needs no browser or login.
"""

from app.rag.retriever import retrieve

APP_PAGES = 4
APP_FLOWS = 3
DOCUMENT_CHUNKS = 4
TEAM_RULES = 4
TEAM_TERMS = 3


class ToolError(ValueError):
    """A tool call that can't be done; the message says why, for the model to read."""


class AnalystTools:
    def __init__(self, project_id, search=retrieve):
        self._project_id = project_id
        self._search = search

    def search_app_map(self, query: str) -> str:
        query = _query(query)
        found = self._search(query, self._project_id, k=APP_PAGES, kind="fact", fact_kind="page")
        found += self._search(query, self._project_id, k=APP_FLOWS, kind="fact", fact_kind="workflow")
        return _format(found, "Nothing in the app map matches that.", with_status=True)

    def search_documents(self, query: str) -> str:
        found = self._search(_query(query), self._project_id, k=DOCUMENT_CHUNKS)
        return _format(found, "No uploaded document matches that.")

    def search_team_knowledge(self, query: str) -> str:
        query = _query(query)
        found = self._search(query, self._project_id, k=TEAM_RULES, kind="fact", fact_kind="rule")
        found += self._search(query, self._project_id, k=TEAM_TERMS, kind="fact", fact_kind="term")
        return _format(found, "The team hasn't stated a rule or term about that.")


def _query(query) -> str:
    if not isinstance(query, str) or not query.strip():
        raise ToolError("query must say what to look for")
    return query.strip()


def _format(found: list[dict], empty: str, with_status: bool = False) -> str:
    if not found:
        return empty
    parts = []
    for item in found:
        label = item.get("source") or "unknown"
        if with_status and item.get("status"):
            label += f" -- {item['status']}"
        parts.append(f"[{label}]\n{item['content']}")
    return "\n\n".join(parts)
