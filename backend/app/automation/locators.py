"""A locator for the element the Explorer acted on, as Playwright Python code,
checked against the live page to match that element and nothing else.

Candidates go from most to least stable -- a test id, then role + accessible
name, label, placeholder, exact text -- and the first that matches exactly the
target wins. When the name repeats (six "Add to cart" buttons), the locator is
scoped to the smallest container that tells them apart, named by its own text.
Only when nothing else is unique does it fall back to a position, among
matches of a specific locator, and say so.

Power Apps canvas apps name every control (data-control-name), which works
like a test id; a nameless button inside one -- a gallery row's click target --
is found through it. An element inside an iframe gets a locator that goes
through page.frame_locator(...).
"""

import json
import re
from dataclasses import dataclass, field
from typing import Optional

TEST_ID_ATTRS = ("data-test", "data-testid", "data-test-id", "data-qa", "data-cy", "data-control-name")
# How far up to look for a named control that owns a nameless element.
OWNER_DEPTH = 4

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
  let owner = null;
  for (let a = el.parentElement, depth = 0; a && depth < %d && !owner; a = a.parentElement, depth++) {
    for (const t of %s) if (a.getAttribute(t)) { owner = {attr: t, value: a.getAttribute(t)}; break; }
  }
  return {
    owner,
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
}""" % (json.dumps(TEST_ID_ATTRS), json.dumps(TEST_ID_ATTRS), OWNER_DEPTH, json.dumps(TEST_ID_ATTRS))


def _q(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


@dataclass
class Candidate:
    """A chain of Playwright locator calls, renderable as code and runnable on a root."""

    method: str
    args: tuple
    kwargs: dict = field(default_factory=dict)
    # Calls applied to this one's result, e.g. a control, then the button inside it.
    then: Optional["Candidate"] = None

    def on(self, root):
        found = getattr(root, self.method)(*self.args, **self.kwargs)
        return self.then.on(found) if self.then else found

    def code(self, root: str = "page") -> str:
        parts = [_q(a) for a in self.args] + [f"{k}={_render(v)}" for k, v in self.kwargs.items()]
        own = f"{root}.{self.method}({', '.join(parts)})"
        return self.then.code(own) if self.then else own


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
    if info["owner"]:
        # Through the named control that holds it: by role + name if it has them, else by tag.
        owner = info["owner"]
        inner = [c for c in found if c.method == "get_by_role"] or [Candidate("locator", (info["tag"],))]
        for c in inner:
            found.append(Candidate("locator", (f"[{owner['attr']}={_q(owner['value'])}]",), then=c))
    # Just its tag: never unique on a page, but it can be within one scoped row.
    found.append(Candidate("locator", (info["tag"],)))
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


def frame_code(frame) -> str:
    """Playwright code reaching `frame` from the page: "page" for the main frame,
    else page.frame_locator(...) for each iframe on the way down."""
    chain = []
    while frame.parent_frame is not None:
        iframe = frame.frame_element()
        selector = None
        for attr in ("name", "id", "title"):
            value = iframe.get_attribute(attr)
            if value:
                candidate = f"iframe[{attr}={_q(value)}]"
                if frame.parent_frame.locator(candidate).count() == 1:
                    selector = candidate
                    break
        if selector:
            chain.append(f".frame_locator({_q(selector)})")
        else:
            index = frame.parent_frame.child_frames.index(frame)
            chain.append(f'.frame_locator("iframe").nth({index})')
        frame = frame.parent_frame
    return "page" + "".join(reversed(chain))


def unique_locator(page, element, frame=None) -> dict:
    """{"locator": Playwright code matching only `element`, "fragile": True if
    it relies on a position}. `element` is a Locator for one element on `page`,
    inside `frame` when it isn't in the main one."""
    in_child = frame is not None and frame.parent_frame is not None
    root = frame if in_child else page
    root_code = frame_code(frame) if in_child else "page"
    target = element.element_handle()
    info = element.evaluate(_ELEMENT_INFO)
    options = candidates(info)

    for candidate in options:
        if _is_only(candidate.on(root), target):
            return {"locator": candidate.code(root_code), "fragile": False}

    # The name repeats: scope it to the smallest container that tells them apart.
    own_name = {info["innerText"], info["ariaLabel"], info["value"]}
    for container in info["containers"]:
        for line in container["lines"]:
            if line in own_name:
                continue
            scope = root.locator(container["selector"]).filter(has_text=line)
            scope_code = f"{root_code}.locator({_q(container['selector'])}).filter(has_text={_q(line)})"
            for candidate in options:
                if _is_only(candidate.on(scope), target):
                    return {"locator": candidate.code(scope_code), "fragile": False}

    # Last resort: its position among one locator's matches.
    for candidate in options:
        index = _index_of(candidate.on(root), target)
        if index is not None:
            return {"locator": f"{candidate.code(root_code)}.nth({index})", "fragile": True}
    index = _index_of(root.locator(info["tag"]), target)
    return {"locator": f"{root_code}.locator({_q(info['tag'])}).nth({index or 0})", "fragile": True}
