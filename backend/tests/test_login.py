"""The login runner against fake login pages in a real (hidden) browser."""

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

PAGES = {"/login": ONE_STEP, "/two-step": TWO_STEP, "/home": "<h1>Welcome</h1>", "/nothing": "<p>Hello</p>"}


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
        "https://app.test/**",
        lambda route: route.fulfill(
            content_type="text/html",
            body=PAGES.get(route.request.url.split("app.test")[1].split("?")[0], "<p>404</p>"),
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
