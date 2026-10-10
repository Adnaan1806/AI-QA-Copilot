"""A locator for the element the Explorer acted on, as Playwright Python code,
checked against the live page to match that element and nothing else.

Candidates go from most to least stable -- a test id, then role + accessible
name, label, placeholder, exact text -- and the first that matches exactly the
target wins. When the name repeats (six "Add to cart" buttons), the locator is
scoped to the smallest container that tells them apart, named by its own text.
Only when nothing else is unique does it fall back to a position, among
matches of a specific locator, and say so.
"""

import json
import re
from dataclasses import dataclass, field
from typing import Optional

TEST_ID_ATTRS = ("data-test", "data-testid", "data-test-id", "data-qa", "data-cy")

# Ids that frameworks generate (":r1:", "input-1234", uuids) change between builds.
_GENERATED_ID = re.compile(r"\d{3,}|^:|[0-9a-f]{8}-[0-9a-f]{4}|^(ember|ext-|gwt-|mui-|react-)", re.IGNORECASE)

_ELEMENT_INFO = """el => {
  const text = s => (s || '').replace(/\\s+/g, ' ').trim();
  const testIds = {};
  for (const a of %s) if (el.getAttribute(a)) testIds[a] = el.getAttribute(a);
  const containers = [];
  for (let a = el.parentElement, depth = 0; a && a !== document.body && depth < 8; a = a.parentElement, depth++) {
    let selector = null;
    for (const t of %s) if (a.getAttribute(t)) { selector = `[${t}=${JSON.stringify(a.getAttribute(t))}]`; break; }
    if (!selector && a.classList.length) selector = a.tagName.toLowerCase() + '.' + CSS.escape(a.classList[0]);
    if (!selector) continue;
    const lines = (a.innerText || '').split('\\n').map(text).filter(l => l && l.length <= 60);
    containers.push({selector, lines: [...new Set(lines)].slice(0, 6)});
  }
  return {
    tag: el.tagName.toLowerCase(),
    type: (el.getAttribute('type') || '').toLowerCase(),
    role: el.getAttribute('role') || '',
    href: el.hasAttribute('href'),
    multiple: el.multiple === true,
    id: el.id || '',
    testIds,
    ariaLabel: text(el.getAttribute('aria-label')),
    labels: el.labels ? [...el.labels].map(l => text(l.innerText)).filter(Boolean) : [],
    placeholder: text(el.getAttribute('placeholder')),
    value: ['button', 'submit', 'reset'].includes((el.getAttribute('type') || '').toLowerCase()) ? text(el.value) : '',
    innerText: text(el.innerText),
    alt: text(el.getAttribute('alt')),
    title: text(el.getAttribute('title')),
    containers,
  };
}""" % (json.dumps(TEST_ID_ATTRS), json.dumps(TEST_ID_ATTRS))


def _q(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


@dataclass
class Candidate:
    """One Playwright locator call, renderable as code and runnable on a root."""

    method: str
    args: tuple
    kwargs: dict = field(default_factory=dict)

    def on(self, root):
        return getattr(root, self.method)(*self.args, **self.kwargs)

    def code(self, root: str = "page") -> str:
        parts = [_q(a) for a in self.args] + [f"{k}={_render(v)}" for k, v in self.kwargs.items()]
        return f"{root}.{self.method}({', '.join(parts)})"


def _render(value) -> str:
    return "True" if value is True else "False" if value is False else _q(value)


def implicit_role(info: dict) -> Optional[str]:
    if info["role"]:
        return info["role"]
    tag, kind = info["tag"], info["type"]
    if tag == "button" or (tag == "input" and kind in ("submit", "button", "reset", "image")):
        return "button"
    if tag == "a" and info["href"]:
        return "link"
    if tag == "input" and kind in ("checkbox", "radio"):
        return kind
    if tag == "input" and kind == "number":
        return "spinbutton"
    if tag == "input" and kind == "search":
        return "searchbox"
    if tag == "textarea" or (tag == "input" and kind in ("", "text", "email", "tel", "url")):
        return "textbox"
    if tag == "select":
        return "listbox" if info["multiple"] else "combobox"
    return None


def candidates(info: dict) -> list[Candidate]:
    """Every way to name the element, most stable first."""
    found = [Candidate("locator", (f"[{attr}={_q(value)}]",)) for attr, value in info["testIds"].items()]
    if info["id"] and not _GENERATED_ID.search(info["id"]):
        found.append(Candidate("locator", (f"[id={_q(info['id'])}]",)))

    role = implicit_role(info)
    names = [info["ariaLabel"], *info["labels"], info["innerText"], info["value"], info["alt"], info["title"]]
    if role in ("textbox", "searchbox", "spinbutton"):
        names.append(info["placeholder"])
    if role:
        for name in dict.fromkeys(n for n in names if n and len(n) <= 80):
            found.append(Candidate("get_by_role", (role,), {"name": name, "exact": True}))
    for label in info["labels"]:
        found.append(Candidate("get_by_label", (label,), {"exact": True}))
    if info["placeholder"]:
        found.append(Candidate("get_by_placeholder", (info["placeholder"],), {"exact": True}))
    if info["innerText"] and len(info["innerText"]) <= 80:
        found.append(Candidate("get_by_text", (info["innerText"],), {"exact": True}))
    return found


def _is_only(locator, target) -> bool:
    try:
        return locator.count() == 1 and locator.evaluate("(el, t) => el === t", target)
    except Exception:
        return False


def _index_of(locator, target) -> Optional[int]:
    try:
        for i, handle in enumerate(locator.element_handles()):
            if handle.evaluate("(el, t) => el === t", target):
                return i
    except Exception:
        pass
    return None


def unique_locator(page, element) -> dict:
    """{"locator": Playwright code matching only `element`, "fragile": True if
    it relies on a position}. `element` is a Locator for one element on `page`."""
    target = element.element_handle()
    info = element.evaluate(_ELEMENT_INFO)
    options = candidates(info)

    for candidate in options:
        if _is_only(candidate.on(page), target):
            return {"locator": candidate.code(), "fragile": False}

    # The name repeats: scope it to the smallest container that tells them apart.
    own_name = {info["innerText"], info["ariaLabel"], info["value"]}
    for container in info["containers"]:
        for line in container["lines"]:
            if line in own_name:
                continue
            scope = page.locator(container["selector"]).filter(has_text=line)
            scope_code = f"page.locator({_q(container['selector'])}).filter(has_text={_q(line)})"
            for candidate in options:
                if _is_only(candidate.on(scope), target):
                    return {"locator": candidate.code(scope_code), "fragile": False}

    # Last resort: its position among one locator's matches.
    for candidate in options:
        index = _index_of(candidate.on(page), target)
        if index is not None:
            return {"locator": f"{candidate.code()}.nth({index})", "fragile": True}
    index = _index_of(page.locator(info["tag"]), target)
    return {"locator": f"page.locator({_q(info['tag'])}).nth({index or 0})", "fragile": True}
