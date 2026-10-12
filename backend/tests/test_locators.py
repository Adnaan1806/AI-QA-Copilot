"""The Explorer's locators match exactly the element it acted on, in a real (hidden) browser."""

import pytest
from playwright.sync_api import sync_playwright

from app.automation.locators import unique_locator

# Six "Add to cart" buttons with nothing but their product card to tell them apart,
# a submit input named only by its value, and a hidden button before it -- the
# saucedemo shapes that broke position-based locators.
SHOP = """
<button id="react-burger-cross-btn" style="display:none">Close Menu</button>
<div class="inventory_list">
  <div class="inventory_item"><div class="name">Sauce Labs Backpack</div><button>Add to cart</button></div>
  <div class="inventory_item"><div class="name">Sauce Labs Bike Light</div><button>Add to cart</button></div>
  <div class="inventory_item"><div class="name">Sauce Labs Onesie</div><button>Add to cart</button></div>
</div>
<form>
  <label for="zip">Zip/Postal Code</label><input id="zip">
  <input placeholder="First Name">
  <input type="submit" value="Continue">
</form>
<button data-test="finish">Finish</button>
<input id="input-48213" placeholder="Search">
<button><svg width="8" height="8"></svg></button>
<button><svg width="8" height="8"></svg></button>
"""


@pytest.fixture(scope="module")
def page():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(SHOP)
        yield page
        browser.close()


def locate(page, selector, nth=0):
    result = unique_locator(page, page.locator(selector).nth(nth))
    # The code must find the same element again on its own.
    found = eval(result["locator"], {"page": page})
    assert found.count() == 1
    assert found.evaluate("(el, t) => el === t", page.locator(selector).nth(nth).element_handle())
    return result


def test_a_test_id_wins(page):
    assert locate(page, "[data-test=finish]") == {"locator": 'page.locator("[data-test=\\"finish\\"]")', "fragile": False}


def test_a_submit_input_is_named_by_its_value(page):
    assert locate(page, "input[type=submit]")["locator"] == 'page.get_by_role("button", name="Continue", exact=True)'


def test_a_field_is_named_by_its_label(page):
    assert locate(page, "#zip")["locator"] == 'page.locator("[id=\\"zip\\"]")'
    assert locate(page, "input[placeholder='First Name']")["locator"] == (
        'page.get_by_role("textbox", name="First Name", exact=True)'
    )


def test_a_generated_id_is_skipped(page):
    assert locate(page, "#input-48213")["locator"] == 'page.get_by_role("textbox", name="Search", exact=True)'


def test_a_repeated_name_is_scoped_to_its_container(page):
    result = locate(page, ".inventory_item button", nth=1)
    assert result == {
        "locator": 'page.locator("div.inventory_item").filter(has_text="Sauce Labs Bike Light")'
        '.get_by_role("button", name="Add to cart", exact=True)',
        "fragile": False,
    }


def test_nothing_unique_falls_back_to_a_position_and_says_so(page):
    result = locate(page, "button:has(svg)", nth=1)
    assert result["fragile"] is True
    assert result["locator"].endswith(".nth(6)")  # among every <button>, hidden ones included


def test_a_choice_is_recorded_by_the_label_a_tester_sees(page):
    from app.automation.explorer_agent import ExplorerAgent

    context = page.context.browser.new_context()
    other = context.new_page()
    other.set_content('<select aria-label="Sort products"><option value="az">Name (A to Z)</option>'
                      '<option value="lohi">Price (low to high)</option></select>')
    select = other.locator("select")
    select.select_option("lohi")  # the LLM may choose by the hidden value
    assert ExplorerAgent._selected_label(select) == "Price (low to high)"
    context.close()
