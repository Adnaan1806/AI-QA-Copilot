"""The login runner against fake login pages in a real (hidden) browser."""

import re

import pytest
from playwright.sync_api import sync_playwright

from app.access.login import LoginFailed, log_in

ONE_STEP = """
<form action="/home" method="get" onsubmit="return check()">
  <label for="u">Username</label><input id="u" name="user-name">
  <label for="p">Password</label><input id="p" type="password">
  <div id="err"></div>
  <input type="submit" value="Login">
</form>
<script>
function check() {
  if (document.getElementById('p').value === 'secret') { document.cookie = 'session=ok; path=/'; return true; }
  // An error icon first, like saucedemo's: an SVG has no inner text.
  document.getElementById('err').innerHTML = '<svg class="error_icon" width="10" height="10"><circle r="5" cx="5" cy="5"/></svg>'
    + '<h3 data-test="error">Epic sadface: Username and password do not match</h3>';
  return false;
}
</script>
"""

TWO_STEP = """
<div id="step1"><input type="email" placeholder="Email"><button onclick="next()">Next</button></div>
<script>
function next() {
  document.getElementById('step1').innerHTML =
    '<input type="password"><button onclick="document.cookie=\\'session=ok; path=/\\'; location=\\'/home\\'">Sign in</button>';
}
</script>
"""

# A Microsoft-like identity provider on its own site. Like Microsoft's, the email
# page already holds a password field, moved off screen.
IDP_SIGN_IN = """
<div id="view">
  <input type="email" name="loginfmt" placeholder="Email, phone, or Skype">
  <input type="password" name="passwd" style="position:absolute;left:-10000px">
  <input type="submit" value="Next" onclick="next()">
</div>
<script>
let email = '';
// Like Microsoft, each step stays on screen for a moment while it's checked.
function next() {
  email = document.querySelector('[name=loginfmt]').value;
  setTimeout(showPassword, 1500);
}
function showPassword() {
  document.getElementById('view').innerHTML =
    '<div role="alert" id="err"></div><p>' + email + '</p><input type="password" name="passwd">'
    + '<input type="submit" value="Sign in" onclick="signIn()">';
}
function signIn() {
  if (document.querySelector('[name=passwd]').value !== 'secret') {
    document.getElementById('err').textContent = 'Your account or password is incorrect.'; return;
  }
  if (email.startsWith('mfa')) { document.body.innerHTML = '<h1>Approve sign in request</h1><p>Open your Authenticator app</p>'; return; }
  document.cookie = 'idp_session=ok; path=/';
  setTimeout(() => { location = 'https://idp.test/kmsi'; }, 1500);
}
</script>
"""

STAY_SIGNED_IN = """
<h1>Stay signed in?</h1>
<label><input type="checkbox"> Don't show this again</label>
<input type="button" value="No" onclick="location='https://app.test/home?no'">
<input type="submit" value="Yes" onclick="location='https://app.test/home'">
"""

PICK_AN_ACCOUNT = """
<h1>Pick an account</h1>
<div role="button" onclick="location='https://idp.test/password'">me@corp.test<br>Signed in</div>
<div role="button" onclick="location='https://idp.test/authorize'">Use another account</div>
"""

IDP_PASSWORD = """
<div role="alert" id="err"></div><p>me@corp.test</p>
<input type="password" name="passwd"><input type="submit" value="Sign in" onclick="location='https://idp.test/kmsi'">
"""

PAGES = {
    "app.test/login": ONE_STEP,
    "app.test/two-step": TWO_STEP,
    "app.test/home": "<h1>Welcome</h1>",
    "app.test/nothing": "<p>Hello</p>",
    # An app with a sign-in button, and one (like Power Apps) that sends you straight to the provider.
    "app.test/sso": "<h1>Firm Manager</h1><button onclick=\"location='https://idp.test/authorize'\">Sign in with Microsoft</button>",
    "app.test/play": "<script>location.replace('https://idp.test/authorize')</script>",
    # Loads its scripts first, then redirects, like Power Apps does.
    "app.test/slow": "<script>setTimeout(() => location.replace('https://idp.test/authorize'), 7000)</script>",
    "app.test/picker": "<script>location.replace('https://idp.test/pick')</script>",
    "idp.test/authorize": IDP_SIGN_IN,
    "idp.test/kmsi": STAY_SIGNED_IN,
    "idp.test/pick": PICK_AN_ACCOUNT,
    "idp.test/password": IDP_PASSWORD,
}


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        yield browser
        browser.close()


@pytest.fixture
def page(browser):
    context = browser.new_context()
    context.route(
        re.compile(r"https://(app|idp)\.test/.*"),
        lambda route: route.fulfill(
            content_type="text/html",
            body=PAGES.get(route.request.url.split("://")[1].split("?")[0], "<p>404</p>"),
        ),
    )
    page = context.new_page()
    yield page
    context.close()


def test_logs_in_with_a_plain_form(page):
    result = log_in(page, "https://app.test/login", "standard_user", "secret")
    assert result.final_url.startswith("https://app.test/home")
    assert any(c["name"] == "session" for c in result.storage_state["cookies"])
    assert page.locator("#u").count() == 0


def test_reports_the_apps_error_on_a_wrong_password(page):
    with pytest.raises(LoginFailed, match="Username and password do not match"):
        log_in(page, "https://app.test/login", "standard_user", "wrong")


def test_two_step_login(page):
    result = log_in(page, "https://app.test/two-step", "me@app.test", "secret")
    assert result.final_url == "https://app.test/home"


def test_no_login_form(page):
    with pytest.raises(LoginFailed, match="No login form found"):
        log_in(page, "https://app.test/nothing", "u", "p")


def test_signs_in_through_a_microsoft_like_provider(page):
    result = log_in(page, "https://app.test/sso", "me@corp.test", "secret")
    # Answered "Stay signed in?" with Yes, and kept the provider's cookie for later runs.
    assert result.final_url == "https://app.test/home"
    assert any(c["name"] == "idp_session" for c in result.storage_state["cookies"])


def test_an_app_that_redirects_straight_to_the_provider(page):
    assert log_in(page, "https://app.test/play", "me@corp.test", "secret").final_url == "https://app.test/home"


def test_waits_for_an_app_that_redirects_after_loading(page):
    assert log_in(page, "https://app.test/slow", "me@corp.test", "secret").final_url == "https://app.test/home"


def test_picks_the_account_on_an_account_picker(page):
    assert log_in(page, "https://app.test/picker", "me@corp.test", "secret").final_url == "https://app.test/home"


def test_reports_the_providers_error(page):
    with pytest.raises(LoginFailed, match="Your account or password is incorrect"):
        log_in(page, "https://app.test/sso", "me@corp.test", "wrong")


def test_says_so_when_the_account_needs_mfa(page):
    with pytest.raises(LoginFailed, match="second factor"):
        log_in(page, "https://app.test/sso", "mfa@corp.test", "secret")
