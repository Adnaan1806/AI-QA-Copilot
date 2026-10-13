"""Mender's line edits, and the guard that refuses edits weakening a script's checks."""

import pytest

from app.automation.script_edits import EditError, apply_edits, check_edit, numbered, weakened_checks

SCRIPT = """from playwright.sync_api import expect


def test_login(page):
    page.goto("https://shop.test")
    page.get_by_placeholder("Username").fill("standard_user")
    page.get_by_role("button", name="Login").click()
    expect(page).to_have_url("https://shop.test/inventory.html")
    expect(page.locator(".title")).to_have_text("Products", timeout=5000)"""


def test_numbered_lines():
    assert numbered("a\nb").splitlines() == ["1 | a", "2 | b"]


def test_apply_edits_replaces_inserts_and_deletes():
    code = "1\n2\n3\n4"
    assert apply_edits(code, [{"from": 2, "to": 3, "new": "x"}]) == "1\nx\n4"
    assert apply_edits(code, [{"from": 2, "to": 1, "new": "x"}]) == "1\nx\n2\n3\n4"
    assert apply_edits(code, [{"from": 4, "to": 4, "new": ""}]) == "1\n2\n3"
    assert apply_edits(code, [{"from": 5, "to": 4, "new": "5"}]) == "1\n2\n3\n4\n5"
    # Line numbers refer to the script before any edit.
    assert apply_edits(code, [{"from": 4, "to": 4, "new": "d"}, {"from": 1, "to": 1, "new": "a\nb"}]) == "a\nb\n2\n3\nd"


@pytest.mark.parametrize(
    "edits",
    [
        [],
        "line 2",
        [{"from": 0, "to": 1, "new": "x"}],
        [{"from": 2, "to": 9, "new": "x"}],
        [{"from": "2", "to": 2, "new": "x"}],
        [{"from": 1, "to": 2, "new": "x"}, {"from": 2, "to": 3, "new": "y"}],
    ],
)
def test_apply_edits_rejects_bad_edits(edits):
    with pytest.raises(EditError):
        apply_edits("1\n2\n3\n4", edits)


def test_locator_fixes_are_allowed_even_inside_a_check():
    fixed = SCRIPT.replace('name="Login"', 'name="LOGIN"').replace('locator(".title")', 'locator("[data-test=title]")')
    check_edit(SCRIPT, fixed)
    # A longer timeout or an added wait isn't weaker.
    check_edit(SCRIPT, SCRIPT.replace("timeout=5000", "timeout=60000"))
    check_edit(SCRIPT, SCRIPT + "\n    expect(page.locator('.cart')).to_be_visible()")


@pytest.mark.parametrize(
    "weaker",
    [
        # Removed
        SCRIPT.replace('    expect(page).to_have_url("https://shop.test/inventory.html")\n', ""),
        # Expected value changed
        SCRIPT.replace('"Products"', '"Product"'),
        # Swapped for a vaguer matcher
        SCRIPT.replace('to_have_text("Products", timeout=5000)', "to_be_visible()"),
        # Negated
        SCRIPT.replace("expect(page).to_have_url", "expect(page).not_to_have_url"),
        # Commented out
        SCRIPT.replace("    expect(page).to_have_url", "    # expect(page).to_have_url"),
    ],
)
def test_weakened_checks_are_refused(weaker):
    with pytest.raises(EditError, match="removed or changed"):
        check_edit(SCRIPT, weaker)


@pytest.mark.parametrize(
    "wrapper",
    [
        "    try:\n        {check}\n    except Exception:\n        pass",
        "    if page.url.endswith('inventory.html'):\n        {check}",
        "    for _ in range(0):\n        {check}",
        "    def later():\n        {check}",
    ],
)
def test_checks_hidden_behind_a_guard_are_refused(wrapper):
    check = 'expect(page).to_have_url("https://shop.test/inventory.html")'
    guarded = SCRIPT.replace(f"    {check}", wrapper.format(check=check))
    with pytest.raises(EditError, match="conditionally"):
        check_edit(SCRIPT, guarded)


def test_plain_asserts_count_as_checks():
    before = "def test_x(page):\n    assert page.title() == 'Shop'"
    assert weakened_checks(before, "def test_x(page):\n    assert page.title()")
    assert not weakened_checks(before, before + "\n    assert True")


def test_edit_that_breaks_the_syntax_is_refused():
    with pytest.raises(EditError, match="doesn't parse"):
        check_edit(SCRIPT, SCRIPT + "\n    page.click(")


def test_original_that_doesnt_parse_still_keeps_its_check_lines():
    broken = "def test_x(page):\n    page.click(\n    expect(page).to_have_title('Shop')"
    assert weakened_checks(broken, "def test_x(page):\n    pass")
    assert not weakened_checks(broken, "def test_x(page):\n    page.click()\n    expect(page).to_have_title('Shop')")
