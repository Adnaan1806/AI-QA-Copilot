"""The app-map crawler: which links it follows, in what order, and where it stops.
Pages are fakes: a dict of path -> links."""

from app.appmap.crawler import SAMPLES_PER_PATTERN, CrawlLimits, crawl
from app.appmap.urls import normalize, pattern, skip_reason

SITE = "https://app.test"


def fake_site(links_by_path, redirects=None, broken=()):
    fetched = []

    def fetch(url):
        fetched.append(url)
        path = url[len(SITE):] or "/"
        if path in broken:
            raise RuntimeError("HTTP 500\nstack trace")
        final = SITE + (redirects or {}).get(path, path)
        links = [{"href": href, "text": text} for href, text in links_by_path.get(path, [])]
        return {"url": final, "title": path, "links": links}

    return fetch, fetched


def run(links_by_path, limits=None, **kwargs):
    fetch, fetched = fake_site(links_by_path, **kwargs)
    result = crawl([SITE + "/"], fetch, limits or CrawlLimits(delay_seconds=0), sleep=lambda s: None)
    return result, fetched


def test_breadth_first_with_depth_and_page_limits():
    site = {
        "/": [("/a", "A"), ("/b", "B")],
        "/a": [("/a/deep", "Deep")],
        "/b": [("/c", "C")],
        "/c": [("/c/deeper", "Deeper")],
    }
    result, fetched = run(site, CrawlLimits(max_pages=10, max_depth=2, delay_seconds=0))
    assert fetched == [SITE + p for p in ["/", "/a", "/b", "/a/deep", "/c"]]
    assert [p["depth"] for p in result.pages] == [0, 1, 1, 2, 2]
    assert result.skipped[SITE + "/c/deeper"] == "deeper than the depth limit"

    result, _ = run(site, CrawlLimits(max_pages=2, max_depth=3, delay_seconds=0))
    assert len(result.pages) == 2
    assert result.skipped[SITE + "/b"] == "page limit reached"


def test_other_sites_files_and_unsafe_links_are_skipped():
    site = {"/": [
        ("https://github.com/x", "GitHub"),
        ("/guide.pdf", "Guide"),
        ("/account/logout", "Log out"),
        ("/settings", "Delete account"),
        ("mailto:a@b.c", "Mail"),
        ("/docs#install", "Docs"),
        ("/docs/", "Docs again"),
    ]}
    result, fetched = run(site)
    assert fetched == [SITE + "/", SITE + "/docs"]  # fragment and trailing slash are the same page
    assert result.skipped["https://github.com/x"] == "other site"
    assert result.skipped[SITE + "/guide.pdf"] == "file, not a page"
    assert result.skipped[SITE + "/account/logout"] == "could change data or end the session"
    assert result.skipped[SITE + "/settings"] == "could change data or end the session"


def test_pages_of_one_type_are_sampled():
    site = {"/": [(f"/orders/{n}", f"Order {n}") for n in range(1, 6)]}
    result, _ = run(site)
    assert len(result.pages) == 1 + SAMPLES_PER_PATTERN
    assert result.pages[1]["pattern"] == "/orders/{id}"
    assert "already have" in result.skipped[SITE + "/orders/5"]


def test_robots_redirects_and_failures():
    fetch, _ = fake_site(
        {"/": [("/private", "P"), ("/old", "Old"), ("/home", "Home"), ("/broken", "B")]},
        redirects={"/old": "/new", "/home": "/"},
        broken={"/broken"},
    )
    result = crawl(
        [SITE + "/"], fetch, CrawlLimits(delay_seconds=0),
        allowed=lambda url: "/private" not in url, sleep=lambda s: None,
    )
    assert result.skipped[SITE + "/private"] == "disallowed by robots.txt"
    # /home redirected to a page already read, so it isn't recorded twice.
    assert [p["url"] for p in result.pages] == [SITE + "/", SITE + "/new"]
    assert result.skipped[SITE + "/broken"] == "failed to load: HTTP 500"


def test_url_rules():
    assert normalize("../b?x=1#top", SITE + "/a/") == SITE + "/b"
    assert normalize("javascript:void(0)", SITE) is None
    assert pattern(SITE + "/users/3fa85f64-5717-4562-b3fc-2c963f66afa6/edit") == "/users/{id}/edit"
    assert skip_reason(SITE + "/x", "Sign out", SITE) is not None


def test_an_error_status_only_means_missing_when_nothing_rendered():
    from app.appmap.browser import rendered_anything

    assert rendered_anything({"title": "Swag Labs", "buttons": [{"role": "button", "name": "Add to cart"}]})
    assert not rendered_anything({"title": "", "headings": [], "buttons": [], "fields": [], "links": []})
