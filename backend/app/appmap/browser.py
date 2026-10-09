"""Reads pages for the crawler with a real (hidden) browser, since many apps
only render their content with JavaScript."""

import logging
from typing import Callable, Optional
from urllib import robotparser
from urllib.request import Request, urlopen

from playwright.sync_api import sync_playwright

from app.appmap.urls import origin

logger = logging.getLogger(__name__)

PAGE_TIMEOUT_MS = 20000
USER_AGENT = "AI-QA-Copilot app-map crawler"
MAX_ITEMS = 60  # per list, per page

# Runs inside the page and returns everything a tester needs from it in one go:
# headings, links, buttons, form fields and visible messages, each with the
# role and accessible name that Playwright's get_by_role() / get_by_label() use.
EXTRACT_JS = """
(maxItems) => {
  const clean = (s) => (s || "").replace(/\\s+/g, " ").trim().slice(0, 120);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  };
  const byId = (id) => id && document.getElementById(id);
  const labelOf = (el) => {
    const labelledby = (el.getAttribute("aria-labelledby") || "").split(" ").map(byId).filter(Boolean);
    if (labelledby.length) return clean(labelledby.map((n) => n.textContent).join(" "));
    if (el.getAttribute("aria-label")) return clean(el.getAttribute("aria-label"));
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return clean(label.textContent);
    }
    const wrapping = el.closest("label");
    if (wrapping) return clean(wrapping.textContent);
    return clean(el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name"));
  };
  const nameOf = (el) => clean(el.getAttribute("aria-label")) || clean(el.innerText || el.value) || labelOf(el);
  const take = (selector, map) =>
    [...document.querySelectorAll(selector)].filter(visible).slice(0, maxItems).map(map);

  const headings = take("h1, h2, h3", (h) => ({ level: Number(h.tagName[1]), text: clean(h.textContent) }))
    .filter((h) => h.text);
  const links = [...document.querySelectorAll("a[href]")].filter(visible).slice(0, 300).map((a) => ({
    href: a.getAttribute("href"),
    text: nameOf(a),
    in_nav: !!a.closest("nav, header, [role=navigation]"),
  }));
  const buttons = take(
    "button, [role=button], input[type=submit], input[type=button], [role=tab], [role=menuitem]",
    (b) => ({ role: b.getAttribute("role") || "button", name: nameOf(b) })
  ).filter((b) => b.name);
  const fields = take(
    "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select, [role=combobox], [role=checkbox], [role=switch]",
    (f) => ({
      label: labelOf(f),
      type: f.tagName === "SELECT" ? "select" : f.tagName === "TEXTAREA" ? "textarea" : (f.getAttribute("type") || f.getAttribute("role") || "text"),
      required: f.required || f.getAttribute("aria-required") === "true",
      options: f.tagName === "SELECT" ? [...f.options].slice(0, 30).map((o) => clean(o.textContent)) : [],
    })
  );
  const messages = take(
    "[role=alert], [role=status], [aria-live=assertive], .error, .alert",
    (m) => clean(m.textContent)
  ).filter(Boolean);

  return { title: document.title, headings, links, buttons, fields, messages };
}
"""


class BrowserFetcher:
    """Opens each URL in one hidden browser tab, reused across the crawl."""

    def __init__(self, storage_state: Optional[dict] = None):
        self._storage_state = storage_state

    def __enter__(self):
        self._playwright = sync_playwright().start()
        # Always hidden: there's nothing to watch, and a refresh shouldn't open 30 windows.
        self._browser = self._playwright.chromium.launch(headless=True)
        self._context = self._browser.new_context(
            user_agent=USER_AGENT, storage_state=self._storage_state
        )
        self._page = self._context.new_page()
        self._page.set_default_timeout(PAGE_TIMEOUT_MS)
        return self

    def __exit__(self, *exc):
        self._context.close()
        self._browser.close()
        self._playwright.stop()

    def fetch(self, url: str) -> dict:
        response = self._page.goto(url, wait_until="domcontentloaded")
        try:
            # Let client-side apps render; some never go fully idle.
            self._page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass
        data = self._page.evaluate(EXTRACT_JS, MAX_ITEMS)
        if response is not None and response.status >= 400 and not rendered_anything(data):
            raise RuntimeError(f"HTTP {response.status}")
        return {**data, "url": self._page.url}


def rendered_anything(data: dict) -> bool:
    """Single-page apps often answer 404 for their own routes, then draw the page
    in the browser anyway (saucedemo's /inventory.html). An error status only
    means a missing page when nothing was drawn."""
    return any(data.get(key) for key in ("headings", "buttons", "fields", "links"))


def robots_rules(start_url: str) -> tuple[Callable[[str], bool], float]:
    """(allowed(url), crawl delay) from the site's robots.txt. A missing or
    unreadable robots.txt allows everything, as crawlers conventionally do."""
    parser = robotparser.RobotFileParser()
    robots_url = f"{origin(start_url)}/robots.txt"
    try:
        with urlopen(Request(robots_url, headers={"User-Agent": USER_AGENT}), timeout=10) as resp:
            parser.parse(resp.read().decode("utf-8", errors="replace").splitlines())
    except Exception as exc:
        logger.info("No usable robots.txt at %s (%s); allowing all", robots_url, exc)
        return (lambda url: True), 0.0
    delay = parser.crawl_delay(USER_AGENT) or 0.0
    return (lambda url: parser.can_fetch(USER_AGENT, url)), float(delay)
