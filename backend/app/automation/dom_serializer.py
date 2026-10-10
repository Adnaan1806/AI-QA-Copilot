"""Serializes a Playwright page into a compact, numbered list of visible interactive
elements. The LLM only ever picks an index from this list -- it never emits a selector
itself, which is the anti-hallucination mechanism the explorer relies on.
"""

INTERACTIVE_SELECTOR = (
    "button, a, input, textarea, select, "
    "[role=button], [role=link], [role=checkbox], [role=combobox], [tabindex]"
)


def _first_nonempty(*values):
    for value in values:
        if value:
            return value
    return ""


def _element_info(locator, index: int) -> dict:
    tag = locator.evaluate("el => el.tagName.toLowerCase()")
    role = locator.get_attribute("role") or ""
    input_type = locator.get_attribute("type") or ""
    placeholder = locator.get_attribute("placeholder") or ""
    aria_label = locator.get_attribute("aria-label") or ""
    try:
        text = locator.inner_text(timeout=500).strip()
    except Exception:
        text = ""
    button_value = (locator.get_attribute("value") or "") if input_type in ("submit", "button", "reset") else ""
    name = _first_nonempty(aria_label, text, button_value, placeholder)

    if role and name:
        strategy, value = "role", f"{role}|{name}"
    elif placeholder:
        strategy, value = "placeholder", placeholder
    elif aria_label:
        strategy, value = "label", aria_label
    elif text:
        strategy, value = "text", text
    else:
        strategy, value = "nth", str(index)

    description_parts = [tag]
    if input_type:
        description_parts.append(f"type={input_type}")
    if name:
        description_parts.append(f'"{name[:60]}"')
    if role:
        description_parts.append(f"(role={role})")
    description = f"[{index}] " + " ".join(description_parts)

    return {
        "locator": locator,
        "description": description,
        "strategy": strategy,
        "value": value,
    }


def serialize_page(page, max_elements: int = 60):
    raw = page.locator(INTERACTIVE_SELECTOR).all()
    elements = []
    for locator in raw:
        try:
            if not locator.is_visible():
                continue
        except Exception:
            continue
        elements.append(_element_info(locator, len(elements)))
        if len(elements) >= max_elements:
            break

    header = [f"URL: {page.url}", f"Title: {page.title()}", ""]
    body = [e["description"] for e in elements]
    return "\n".join(header + body), elements
