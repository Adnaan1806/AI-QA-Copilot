"""Mender's view of the page: the script cut at a line, then probed in a real browser."""

import pytest

from app import config
from app.automation.page_probe import ProbeError, cut_script, find_element, look_at_page

SCRIPT = '''from playwright.sync_api import expect


def test_shop(page):
    page.goto({url!r})
    page.get_by_placeholder("Username").fill("standard_user")
    page.get_by_role("button", name="Log in").click()
    expect(page.locator(".title")).to_have_text("Products")'''

SHOP = """<html><head><title>Shop</title></head><body>
<input placeholder="Username">
<button onclick="document.querySelector('.title').textContent = 'Inventory'">Login</button>
<button>Login help</button>
<span class="title">Welcome</span>
</body></html>"""


def test_cut_runs_everything_before_the_line():
    code = SCRIPT.format(url="https://shop.test")
    script, cut = cut_script(code, 7)
    assert cut == 7
    lines = script.splitlines()
    assert lines[-3].strip().startswith('page.get_by_placeholder("Username")')
    assert lines[-1] == "    _mender_probe(page)"
    # No line, or a line past the test: the whole test runs first.
    assert cut_script(code, None)[1] == 9
    assert cut_script(code, 99)[1] == 9
    # A line before the body stops before its first statement.
    assert cut_script(code, 1)[1] == 5


def test_cut_snaps_to_the_start_of_a_multi_line_statement():
    code = "def test_x(page):\n    page.goto(\n        'https://x.test'\n    )\n\n    page.click('a')"
    assert cut_script(code, 3)[1] == 2
    # A blank line between statements stops before the next one.
    assert cut_script(code, 5)[1] == 6


def test_cut_hides_other_tests_from_pytest():
    code = "def test_other(page):\n    pass\n\n\ndef test_x(page):\n    page.click('a')"
    script, _ = cut_script(code, 6)
    assert "def _probe_skipped_test_other(page)" in script and "def test_x(page)" in script


def test_cut_needs_a_test_taking_the_page():
    with pytest.raises(ProbeError):
        cut_script("def helper():\n    pass", 1)
    with pytest.raises(ProbeError):
        cut_script("def test_x(page):\n    page.click(", 1)


@pytest.fixture
def shop_script(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PLAYWRIGHT_HEADLESS", True)
    page = tmp_path / "shop.html"
    page.write_text(SHOP, encoding="utf-8")
    return SCRIPT.format(url=page.as_uri())


def test_look_at_page_shows_the_page_before_the_line(shop_script):
    seen = look_at_page(shop_script, 7)
    assert seen["reached"] and seen["stopped_before_line"] == 7
    assert "Title: Shop" in seen["snapshot"]
    assert 'button "Login"' in seen["snapshot"]
    assert "Welcome" in seen["text"]


def test_look_at_page_reports_a_script_that_fails_first(shop_script):
    # Line 7's button is named "Login", not "Log in": stopping after it never reaches the probe.
    seen = look_at_page(shop_script, 8)
    assert not seen["reached"]
    assert "failed before line 8" in seen["error"]


def test_find_element_returns_locators_checked_to_be_unique(shop_script):
    found = find_element(shop_script, "Login", 7)
    assert found["reached"]
    locators = [m["locator"] for m in found["matches"]]
    assert 'page.get_by_role("button", name="Login", exact=True)' in locators
    assert 'page.get_by_role("button", name="Login help", exact=True)' in locators
    assert not any(m["fragile"] for m in found["matches"])


def test_find_element_needs_text():
    with pytest.raises(ProbeError):
        find_element("def test_x(page):\n    pass", " ", None)
