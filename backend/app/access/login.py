"""Logs in to a project's app with a stored account, by filling the login form
like a person would. Plain code, no LLM: the password never leaves the backend.

Finds the visible password field, the username field in the same form (or
the visible text/email field before it), and the form's submit button. A
two-step login (username, Next, then password) is handled too. Success means
the password field is gone after submitting; otherwise the visible error is
reported. Single sign-on with MFA can't be done this way."""

import re
from dataclasses import dataclass
from typing import Optional

STEP_TIMEOUT_MS = 15000
# Buttons that move a login form on, by their visible text.
SUBMIT_TEXT = re.compile(r"^\s*(log\s*-?in|sign\s*-?in|continue|next|submit|go)\s*$", re.IGNORECASE)

USERNAME_SELECTOR = (
    "input[type=email], input[autocomplete=username], input[autocomplete=email], "
    "input[name*=user i], input[id*=user i], input[name*=email i], input[id*=email i], "
    "input[type=text], input:not([type])"
)
ERROR_SELECTOR = "[role=alert], .error, .alert, [class*=error i], [data-test*=error i]"


class LoginFailed(Exception):
    pass


@dataclass
class LoginResult:
    storage_state: dict
    final_url: str


def _visible(locator):
    return [el for el in locator.all() if el.is_visible()]


def _form_of(page, field):
    form = field.locator("xpath=ancestor::form[1]")
    return form if form.count() else page.locator("body")


def _username_field(scope, password_field=None):
    """The visible username-like field; with a password field, the last one before it."""
    candidates = _visible(scope.locator(USERNAME_SELECTOR))
    if password_field is not None:
        handle = password_field.element_handle()
        before = [
            el for el in candidates
            if el.evaluate("(el, pw) => !!(el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)", handle)
        ]
        if before:
            return before[-1]
    return candidates[0] if candidates else None


def _submit(scope, field):
    buttons = _visible(scope.locator("button[type=submit], input[type=submit]"))
    if not buttons:
        buttons = [
            b for b in _visible(scope.locator("button, [role=button], input[type=button]"))
            if SUBMIT_TEXT.match(b.inner_text() or b.get_attribute("value") or "")
        ]
    if buttons:
        buttons[0].click()
    else:
        field.press("Enter")


def _visible_error(page) -> Optional[str]:
    for el in _visible(page.locator(ERROR_SELECTOR)):
        # text_content: error icons are often SVGs, which have no inner text.
        text = " ".join((el.text_content() or "").split())
        if text:
            return text[:300]
    return None


def _settle(page):
    try:
        page.wait_for_load_state("networkidle", timeout=5000)
    except Exception:
        pass


def log_in(page, login_url: str, username: str, password: str) -> LoginResult:
    """Log in on `page` (whose context keeps the cookies) and return the session."""
    page.goto(login_url, wait_until="domcontentloaded", timeout=STEP_TIMEOUT_MS)
    _settle(page)

    password_fields = _visible(page.locator("input[type=password]"))
    if not password_fields:
        # Two-step login: the username comes first, then the password.
        user = _username_field(page.locator("body"))
        if user is None:
            raise LoginFailed(f"No login form found at {page.url}")
        user.fill(username)
        _submit(_form_of(page, user), user)
        try:
            page.locator("input[type=password]").first.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
        except Exception:
            error = _visible_error(page)
            raise LoginFailed(error or "After the username, no password field appeared.") from None
        password_fields = _visible(page.locator("input[type=password]"))
        user = None
    else:
        user = _username_field(_form_of(page, password_fields[0]), password_fields[0])
        if user is None:
            raise LoginFailed("Found a password field but no username field next to it.")
        user.fill(username)

    password_field = password_fields[0]
    password_field.fill(password)
    _submit(_form_of(page, password_field), password_field)
    try:
        password_field.wait_for(state="hidden", timeout=STEP_TIMEOUT_MS)
    except Exception:
        error = _visible_error(page)
        raise LoginFailed(error or "The login form was still showing after submitting.") from None
    _settle(page)
    return LoginResult(storage_state=page.context.storage_state(), final_url=page.url)
