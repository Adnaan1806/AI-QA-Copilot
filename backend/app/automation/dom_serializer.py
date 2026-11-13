"""Serializes a Playwright page into a compact, numbered list of visible interactive
elements. The LLM only ever picks an index from this list -- it never emits a selector
itself, which is the anti-hallucination mechanism the explorer relies on.

Elements inside iframes are listed too (embedded forms and widgets). Each frame
is read in one call, since asking about elements one by one is slow on large
pages. Listed elements are marked with a data attribute so the Explorer can
act on the one the LLM picked.
"""

INTERACTIVE_SELECTOR = (
    "button, a, input, textarea, select, "
    "[role=button], [role=link], [role=checkbox], [role=combobox], [role=tab], [role=menuitem], "
    "[role=option], [role=radio], [role=switch], [tabindex]"
)
# Marks the elements of the latest snapshot; never used in a recorded locator.
MARK_ATTR = "data-qa-explore"

_READ_FRAME = """([selector, mark, start, budget]) => {
  const text = s => (s || '').replace(/\\s+/g, ' ').trim();
  document.querySelectorAll(`[${mark}]`).forEach(el => el.removeAttribute(mark));
  const found = [];
  for (const el of document.querySelectorAll(selector)) {
    if (found.length >= budget) break;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || el.closest('[aria-hidden=true]')) continue;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const ariaLabel = text(el.getAttribute('aria-label'));
    const innerText = text(el.innerText);
    const placeholder = text(el.getAttribute('placeholder'));
    const buttonValue = ['submit', 'button', 'reset'].includes(type) ? text(el.value) : '';
    const name = ariaLabel || innerText || buttonValue || placeholder || text(el.getAttribute('title'));
    let context = '';
    if (!name) {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const t = text(a.innerText);
        if (t) { context = t.slice(0, 80); break; }
      }
    }
    // A dropdown's choices: they decide what a step can select, but its
    // innerText runs them together.
    const options = el.tagName === 'SELECT' ? [...el.options].slice(0, 15).map(o => text(o.text)).filter(Boolean) : [];
    el.setAttribute(mark, String(start + found.length));
    found.push({
      tag: el.tagName.toLowerCase(), type, role: el.getAttribute('role') || '', name, ariaLabel, innerText,
      placeholder, context, options,
    });
  }
  return found;
}"""


def _visible_frames(page):
    """The main frame, then every frame whose iframe is shown on the page."""
    frames = [page.main_frame]
    for frame in page.frames:
        if frame is page.main_frame:
            continue
        try:
            box = frame.frame_element().bounding_box()
        except Exception:
            continue
        if box and box["width"] > 1 and box["height"] > 1:
            frames.append(frame)
    return frames


def _describe(index: int, info: dict) -> str:
    parts = [f"[{index}]", info["tag"]]
    if info["type"]:
        parts.append(f"type={info['type']}")
    if info["name"]:
        parts.append(f'"{info["name"][:60]}"')
    elif info["context"]:
        parts.append(f'in "{info["context"][:60]}"')
    if info["role"]:
        parts.append(f"(role={info['role']})")
    if info.get("options"):
        parts.append("options: " + " | ".join(info["options"]))
    return " ".join(parts)


def _strategy(index: int, info: dict) -> tuple[str, str]:
    """How a tester would name the element, for learned workflows."""
    if info["role"] and info["name"]:
        return "role", f"{info['role']}|{info['name']}"
    if info["placeholder"]:
        return "placeholder", info["placeholder"]
    if info["ariaLabel"]:
        return "label", info["ariaLabel"]
    if info["innerText"]:
        return "text", info["innerText"]
    return "nth", str(index)


def serialize_page(page, max_elements: int = 80):
    elements = []
    for frame in _visible_frames(page):
        budget = max_elements - len(elements)
        if budget <= 0:
            break
        try:
            infos = frame.evaluate(_READ_FRAME, [INTERACTIVE_SELECTOR, MARK_ATTR, len(elements), budget])
        except Exception:
            continue  # a frame that navigated away mid-read
        for info in infos:
            index = len(elements)
            strategy, value = _strategy(index, info)
            elements.append(
                {
                    "locator": frame.locator(f'[{MARK_ATTR}="{index}"]'),
                    "frame": frame,
                    "description": _describe(index, info),
                    "strategy": strategy,
                    "value": value,
                }
            )

    header = [f"URL: {page.url}", f"Title: {page.title()}", ""]
    body = [e["description"] for e in elements]
    return "\n".join(header + body), elements
