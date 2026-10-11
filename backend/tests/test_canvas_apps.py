"""Power Apps canvas apps: screens inside an iframe on another site, controls named
by data-control-name, drawn only after a long load. Faked in a real (hidden) browser."""

import pytest
from playwright.sync_api import sync_playwright

from app.automation.dom_serializer import serialize_page
from app.automation.explorer_agent import ExplorerAgent
from app.automation.executor import script_timeout_seconds
from app.automation.locators import unique_locator
from app.automation.readiness import wait_until_ready

PLAYER = '<iframe name="fullscreen-app-host" src="https://runtime-app.powerplatform.com/app" style="width:1000px;height:700px"></iframe>'

# The real app shows "Getting data" and then draws every control at once.
CANVAS = """
<div id="app">Getting data ...</div>
<script>
setTimeout(() => {
  const row = (name) => `<div data-control-name="Container5_3"><div data-control-name="Status_2">Pending</div>
    <div data-control-name="Report Name_2">${name}</div><button data-control-part="button"></button></div>`;
  document.getElementById('app').innerHTML = `
    <div class="activeScreen" data-control-name="Home">
      <div data-control-name="HomeButton_19"><button>Home</button></div>
      <div data-control-name="ReportsButton_19"><button onclick="openReports()">Reports</button></div>
      <div data-control-name="Gallery4_1">${row('United States 2020')}${row('Belgium 2021')}</div>
    </div>`;
}, 2500);
// Screens swap in place; the URL never changes.
function openReports() {
  document.getElementById('app').innerHTML = '<div class="activeScreen" data-control-name="Reports Screen"><h1>Reports</h1></div>';
}
</script>
"""


@pytest.fixture
def page():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        context.route("https://apps.powerapps.com/**", lambda r: r.fulfill(content_type="text/html", body=PLAYER))
        context.route("https://runtime-app.powerplatform.com/**", lambda r: r.fulfill(content_type="text/html", body=CANVAS))
        page = context.new_page()
        page.goto("https://apps.powerapps.com/play/e/1/a/2")
        yield page
        browser.close()


def element(elements, text):
    return next(e for e in elements if text in e["description"])


def check(page, located, el):
    """The recorded code finds exactly the element the Explorer acted on."""
    found = eval(located["locator"], {"page": page})
    assert found.count() == 1
    assert found.evaluate("(a, b) => a === b", el["locator"].element_handle())


def test_waits_for_the_controls_and_reads_inside_the_frame(page):
    waited = wait_until_ready(page)
    assert waited >= 2500  # not fooled by the loading screen

    snapshot, elements = serialize_page(page)
    assert '"Reports" (control ReportsButton_19)' in snapshot
    # A gallery row's nameless click target is described by its row.
    assert 'button in "Pending Belgium 2021" (control Container5_3)' in snapshot


def test_a_control_is_located_by_its_name_through_the_frame(page):
    wait_until_ready(page)
    _, elements = serialize_page(page)
    reports = element(elements, '"Reports"')
    located = unique_locator(page, reports["locator"], reports["frame"])
    assert located == {
        "locator": 'page.frame_locator("iframe[name=\\"fullscreen-app-host\\"]")'
        '.get_by_role("button", name="Reports", exact=True)',
        "fragile": False,
    }
    check(page, located, reports)


def test_a_gallery_rows_button_is_scoped_to_its_row(page):
    wait_until_ready(page)
    _, elements = serialize_page(page)
    row = element(elements, "Belgium 2021")
    located = unique_locator(page, row["locator"], row["frame"])
    assert not located["fragile"]
    assert 'has_text="Belgium 2021"' in located["locator"]
    check(page, located, row)


def test_a_script_that_waits_for_a_slow_app_gets_that_long():
    assert script_timeout_seconds("page.goto(url)") == 60
    assert script_timeout_seconds('page.locator("x").wait_for(timeout=240000)') == 300


def test_the_current_screen_is_named_and_checkable(page):
    wait_until_ready(page)
    snapshot, elements = serialize_page(page)
    assert "Screen: Home" in snapshot

    element(elements, '"Reports"')["locator"].click()
    screen = ExplorerAgent._screen(page)
    assert screen["name"] == "Reports Screen"
    # The code codegen is told to assert with finds the screen now shown.
    assert eval(screen["locator"], {"page": page}).count() == 1
