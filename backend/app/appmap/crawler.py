"""Breadth-first crawl of one site. Plain rules, no LLM: open a page, record it,
queue its links, repeat until the page or depth limit.

Breadth-first means every page one click from the start is visited before any
page two clicks away, so a page limit cuts off the deepest pages, not whole
sections."""

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Optional

from app.appmap.urls import normalize, origin, pattern, skip_reason

# Pages of the same type (e.g. /products/{id}) beyond this are skipped.
SAMPLES_PER_PATTERN = 2


@dataclass
class CrawlLimits:
    max_pages: int = 30
    max_depth: int = 3
    delay_seconds: float = 0.5


@dataclass
class CrawlResult:
    pages: list[dict] = field(default_factory=list)
    # url -> why it wasn't visited; shown so a reviewer can see the crawl's edges.
    skipped: dict[str, str] = field(default_factory=dict)


def crawl(
    start_urls: list[str],
    fetch: Callable[[str], dict],
    limits: CrawlLimits,
    allowed: Callable[[str], bool] = lambda url: True,
    on_page: Optional[Callable[[dict], None]] = None,
    sleep: Callable[[float], None] = time.sleep,
) -> CrawlResult:
    """`fetch(url)` opens the page and returns what's on it, including "links"
    ([{"href", "text"}]) and the "url" it ended up on after redirects."""
    result = CrawlResult()
    site = origin(start_urls[0])
    queue = deque()
    seen: set[str] = set()
    per_pattern: dict[str, int] = {}

    def enqueue(url: str, depth: int, link_text: str = "") -> None:
        if url in seen:
            return
        seen.add(url)
        reason = skip_reason(url, link_text, site)
        if reason is None and depth > limits.max_depth:
            reason = "deeper than the depth limit"
        if reason is None and not allowed(url):
            reason = "disallowed by robots.txt"
        if reason is None:
            key = pattern(url)
            if per_pattern.get(key, 0) >= SAMPLES_PER_PATTERN:
                reason = f"already have {SAMPLES_PER_PATTERN} pages like {key}"
            else:
                per_pattern[key] = per_pattern.get(key, 0) + 1
        if reason:
            result.skipped[url] = reason
        else:
            queue.append((url, depth))

    for start in start_urls:
        url = normalize(start, start)
        if url:
            enqueue(url, 0)

    visited_final: set[str] = set()
    while queue and len(result.pages) < limits.max_pages:
        url, depth = queue.popleft()
        if result.pages:
            sleep(limits.delay_seconds)
        try:
            page = fetch(url)
        except Exception as exc:
            result.skipped[url] = f"failed to load: {str(exc).splitlines()[0][:200]}"
            continue

        final = normalize(page.get("url") or url, url) or url
        if final in visited_final:
            continue  # a redirect to a page already recorded
        visited_final.add(final)
        if origin(final) != site:
            result.skipped[url] = "redirected to another site"
            continue
        seen.add(final)

        page = {**page, "url": final, "depth": depth, "pattern": pattern(final)}
        result.pages.append(page)
        if on_page:
            on_page(page)
        for link in page.get("links", []):
            target = normalize(link.get("href", ""), final)
            if target:
                enqueue(target, depth + 1, link.get("text", ""))

    for url, _depth in queue:
        result.skipped[url] = "page limit reached"
    return result
