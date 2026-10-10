"""Logs in to a project's app with a stored account, by filling the login form
like a person would. Plain code, no LLM: the password never leaves the backend.

A login can span several pages and sites: the app's own form, or a "Sign in
with Microsoft" button leading to an identity provider that asks for the
username, then the password, then "Stay signed in?". Each turn looks at the
page and does the one thing it asks for -- fill the password (and the username
next to it), fill the username alone, pick the account, answer the prompt, or
press the sign-in button -- until the browser is back on the app with no login
form showing. A visible error is reported as it is. A second factor (MFA)
can't be done this way and is reported as such."""

import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

STEP_TIMEOUT_MS = 15000
# Pages a login may pass through, e.g. app -> provider email -> password -> stay signed in -> app.
MAX_TURNS = 10
# How long to wait for the redirects back to the app once the login is done.
RETURN_TIMEOUT_MS = 30000
POLL_MS = 500

# Buttons that move a login form on, by their visible text.
SUBMIT_TEXT = re.compile(r"^\s*(log\s*-?in|sign\s*-?in|continue|next|submit|go|verify)\s*$", re.IGNORECASE)
# Buttons that start a login on an app page without a form ("Sign in with Microsoft").
SIGN_IN_TEXT = re.compile(
    r"^\s*(log\s*-?in|sign\s*-?in|continue|single sign-?on|sso)\b.{0,40}$"
    r"|\b(microsoft|google|okta|azure|entra|work or school account)\b",
    re.IGNORECASE,
)
# "Stay signed in?" and similar prompts after the password: the answer that goes on.
PROMPT_ANSWER_TEXT = re.compile(r"^\s*(yes|continue|accept|ok|stay signed in)\s*$", re.IGNORECASE)
# A second factor the account would need someone's phone for.
MFA_TEXT = re.compile(
    r"approve (the |your )?sign.?in request|enter (the )?code|verify your identity|more information (is )?required"
    r"|authenticator app|text message|two-step verification|2-step verification|security key",
    re.IGNORECASE,
)

USERNAME_SELECTOR = (
    "input[type=email], input[autocomplete=username], input[autocomplete=email], "
    "input[name*=user i], input[id*=user i], input[name*=email i], input[id*=email i], "
    "input[name*=login i], input[type=text], input:not([type])"
)
ERROR_SELECTOR = "[role=alert], .error, .alert, [class*=error i], [data-test*=error i]"
BUTTON_SELECTOR = "button, [role=button], input[type=submit], input[type=button], a"


class LoginFailed(Exception):
    pass


@dataclass
class LoginResult:
    storage_state: dict
    final_url: str
    # What the page looked like once logged in, as proof for the person checking.
    screenshot: Optional[bytes] = None


def _usable(el) -> bool:
    """Visible, on screen and enabled. Providers keep later steps' fields in the
    page, moved off screen (Microsoft's password field sits on its email page)."""
    try:
        return el.is_visible() and el.evaluate(
            """el => {
              const r = el.getBoundingClientRect();
              return r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0
                && r.left < innerWidth && !el.disabled && !el.closest('[aria-hidden=true]');
            }"""
        )
    except Exception:
        return False


def _visible(locator):
    return [el for el in locator.all() if _usable(el)]


def _form_of(page, field):
    form = field.locator("xpath=ancestor::form[1]")
    return form if form.count() else page.locator("body")


def _username_field(scope, password_field=None):
    """The usable username-like field; with a password field, the last one before it."""
    candidates = _visible(scope.locator(USERNAME_SELECTOR))
    if password_field is not None:
        handle = password_field.element_handle()
        before = [
            el for el in candidates
            if el.evaluate("(el, pw) => !!(el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)", handle)
        ]
        return before[-1] if before else None
    return candidates[0] if candidates else None


def _label(el) -> str:
    return " ".join((el.inner_text() or el.get_attribute("value") or el.get_attribute("aria-label") or "").split())


def _button(scope, text: re.Pattern):
    return next((b for b in _visible(scope.locator(BUTTON_SELECTOR)) if text.search(_label(b))), None)


def _submit(scope, field):
    buttons = _visible(scope.locator("button[type=submit], input[type=submit]"))
    if not buttons:
        buttons = [b for b in _visible(scope.locator("button, [role=button], input[type=button]")) if SUBMIT_TEXT.match(_label(b))]
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
    page.wait_for_timeout(300)  # single-page providers swap steps without loading a page


def _fill(field, value: str):
    if field.input_value() != value:
        field.fill(value)


def short_url(url: str) -> str:
    """The URL without its query: sign-in URLs carry kilobytes of parameters."""
    parts = urlparse(url)
    return f"{parts.scheme}://{parts.netloc}{parts.path}"


def _host(url: str) -> str:
    return urlparse(url).hostname or ""


def _on_login_step(page) -> bool:
    return bool(_visible(page.locator("input[type=password]")) or _username_field(page.locator("body")))


def log_in(page, login_url: str, username: str, password: str) -> LoginResult:
    """Log in on `page` (whose context keeps the cookies) and return the session."""
    page.goto(login_url, wait_until="domcontentloaded", timeout=STEP_TIMEOUT_MS)
    _settle(page)
    app_host = _host(login_url)
    done: set[str] = set()  # each kind of step at most once, so a rejected one isn't retried forever

    turns, idle_ms = 0, 0

    def still_showing(message: str):
        """A step already done is still on screen: an error now, or the page is
        still checking it -- keep looking until STEP_TIMEOUT_MS has passed."""
        nonlocal idle_ms
        error = _visible_error(page)
        if error or idle_ms >= STEP_TIMEOUT_MS:
            raise LoginFailed(error or message)
        page.wait_for_timeout(POLL_MS)
        idle_ms += POLL_MS

    while turns < MAX_TURNS:
        passwords = _visible(page.locator("input[type=password]"))
        if passwords:
            if "password" in done:
                still_showing("The login form was still showing after submitting.")
                continue
            user = _username_field(_form_of(page, passwords[0]), passwords[0])
            if user is not None:
                _fill(user, username)
            elif not done & {"username", "picked"}:
                raise LoginFailed("Found a password field but no username field next to it.")
            passwords[0].fill(password)
            _submit(_form_of(page, passwords[0]), passwords[0])
            done.add("password")
        elif "password" not in done and (user := _username_field(page.locator("body"))) is not None:
            if "username" in done:
                still_showing("After the username, no password field appeared.")
                continue
            _fill(user, username)
            _submit(_form_of(page, user), user)
            done.add("username")
        elif "picked" not in done and (tile := _account_tile(page, username)) is not None:
            tile.click()
            done.add("picked")
        elif MFA_TEXT.search(page.locator("body").inner_text()):
            raise LoginFailed(
                "The sign-in asks for a second factor (MFA), which can't be automated. "
                "Use an account without MFA for testing."
            )
        elif "password" in done and (answer := _button(page.locator("body"), PROMPT_ANSWER_TEXT)) is not None \
                and _host(page.url) != app_host:
            done.add(f"prompt:{_label(answer)}:{page.url}")  # before the click navigates away
            answer.click()
        elif "sign-in" not in done and "password" not in done and (start := _button(page.locator("body"), SIGN_IN_TEXT)):
            start.click()
            done.add("sign-in")
        elif ("password" in done and _host(page.url) == app_host) or idle_ms >= STEP_TIMEOUT_MS:
            break
        else:
            # Nothing to do yet: the page may still be loading or redirecting
            # (Power Apps loads its scripts before sending you to Microsoft).
            page.wait_for_timeout(POLL_MS)
            idle_ms += POLL_MS
            continue
        turns, idle_ms = turns + 1, 0
        _settle(page)

    if "password" not in done:
        raise LoginFailed(_visible_error(page) or f"No login form found at {short_url(page.url)}")

    # Back to the app: a provider redirects there, maybe through a few pages.
    try:
        page.wait_for_url(lambda url: _host(url) == app_host, timeout=RETURN_TIMEOUT_MS)
    except Exception:
        raise LoginFailed(
            _visible_error(page) or f"Signed in, but the browser didn't return to the app (stuck at {_host(page.url)})."
        ) from None
    _settle(page)
    if _on_login_step(page):
        raise LoginFailed(_visible_error(page) or "The login form was still showing after submitting.")
    return LoginResult(
        storage_state=page.context.storage_state(),
        final_url=page.url,
        screenshot=page.screenshot(type="jpeg", quality=70),
    )


def _account_tile(page, username: str):
    """An account picker's tile for this account ("Pick an account")."""
    tiles = _visible(page.locator("[role=button], [role=option], [role=link], button, a, div[data-test-id]").filter(
        has_text=re.compile(re.escape(username), re.IGNORECASE)
    ))
    # The innermost clickable one: its text is little more than the account.
    return min(tiles, key=lambda t: len(t.inner_text() or ""), default=None)
