"""Which URLs the crawler visits, and when two URLs count as the same page."""

import re
from typing import Optional
from urllib.parse import urljoin, urlsplit, urlunsplit

# Links that change state or end the session. The crawler only reads, so it
# never follows these even though they are plain links.
UNSAFE_LINK = re.compile(r"log[\s_-]?out|sign[\s_-]?out|log[\s_-]?off|delete|remove|unsubscribe|destroy", re.IGNORECASE)
NOT_A_PAGE = re.compile(
    r"\.(pdf|zip|gz|tar|png|jpe?g|gif|svg|webp|ico|mp4|mp3|webm|css|js|json|xml|txt|woff2?)$", re.IGNORECASE
)
# Path parts that are record ids, so /orders/17 and /orders/42 are one page type.
ID_SEGMENT = re.compile(
    r"^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$", re.IGNORECASE
)


def origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}".lower()


def normalize(url: str, base: str) -> Optional[str]:
    """Absolute URL without fragment or query, or None if it isn't a web page link."""
    absolute = urljoin(base, url.strip())
    parts = urlsplit(absolute)
    if parts.scheme not in ("http", "https"):
        return None
    path = parts.path or "/"
    if len(path) > 1:
        path = path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", ""))


def pattern(url: str) -> str:
    """The page type: the path with id-like parts replaced, e.g. /orders/{id}."""
    path = urlsplit(url).path or "/"
    return "/".join("{id}" if ID_SEGMENT.match(part) else part for part in path.split("/")) or "/"


def skip_reason(url: str, link_text: str, site_origin: str) -> Optional[str]:
    if origin(url) != site_origin:
        return "other site"
    if NOT_A_PAGE.search(urlsplit(url).path):
        return "file, not a page"
    if UNSAFE_LINK.search(url) or UNSAFE_LINK.search(link_text or ""):
        return "could change data or end the session"
    return None
