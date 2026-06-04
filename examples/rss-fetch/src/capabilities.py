"""kruxos-rss-fetch — Capability implementations.

Each function implements one capability defined in definitions/*.yaml.
The capability name maps to the function name with dots replaced by
underscores (rss.fetch -> rss_fetch).

Stdlib only — urllib for the fetch, xml.etree for the parse — so the pack runs
on the appliance with no third-party dependencies to install.
"""

from __future__ import annotations

import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urlsplit

DEFAULT_LIMIT = 20
MAX_LIMIT = 100
DEFAULT_TIMEOUT = 15
MAX_TIMEOUT = 60

_ALLOWED_SCHEMES = ("http", "https")
_USER_AGENT = "kruxos-rss-fetch/1.1 (+https://github.com/altvale/kruxos)"

# Syndication module (RSS 1.0 / many RSS 2.0 feeds): how long one
# <sy:updatePeriod> lasts, in minutes.
_SY_NS = "http://purl.org/rss/1.0/modules/syndication/"
_PERIOD_MINUTES = {
    "hourly": 60,
    "daily": 1440,
    "weekly": 10080,
    "monthly": 43200,
    "yearly": 525600,
}


class InvalidURL(ValueError):
    """URL is missing, malformed, or uses a non-http(s) scheme.

    Subclasses ValueError, so a generic ``except ValueError`` still catches it.
    """


class FetchFailed(ConnectionError):
    """The feed could not be retrieved (DNS, TLS, timeout, HTTP error).

    Subclasses ConnectionError, so a generic ``except ConnectionError`` works.
    """


class ParseFailed(SyntaxError):
    """The response was retrieved but is not a parseable RSS/Atom feed.

    Subclasses SyntaxError, so a generic ``except SyntaxError`` works.
    """


def _local(tag: str) -> str:
    """Strip an XML namespace from a tag — '{ns}item' -> 'item'."""
    return tag.rsplit("}", 1)[-1]


def _validate_url(url: str) -> None:
    """Raise InvalidURL synchronously, before any network work."""
    if not url or not isinstance(url, str):
        raise InvalidURL("url must be a non-empty string")
    parts = urlsplit(url.strip())
    if parts.scheme not in _ALLOWED_SCHEMES:
        raise InvalidURL(
            f"unsupported scheme {parts.scheme!r}: only http/https feeds are "
            f"allowed (file:// and other schemes are rejected)"
        )
    if not parts.netloc:
        raise InvalidURL(f"url has no host: {url!r}")


def _fetch(url: str, timeout: int) -> tuple[bytes, str]:
    """Fetch the feed body.

    Returns (raw_bytes, final_url_after_redirects).
    Raises FetchFailed on any network or HTTP error.
    """
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read(), resp.geturl()
    except urllib.error.HTTPError as e:
        raise FetchFailed(f"feed returned HTTP {e.code} for {url!r}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise FetchFailed(f"could not fetch feed {url!r}: {e}") from e


def _text(elem: ET.Element, *local_names: str) -> str:
    """First non-empty child text whose local tag is one of ``local_names``."""
    for child in elem:
        if _local(child.tag) in local_names and child.text and child.text.strip():
            return child.text.strip()
    return ""


def _link(elem: ET.Element) -> str:
    """Entry link: RSS ``<link>text</link>`` or Atom ``<link href=...>``."""
    fallback = ""
    for child in elem:
        if _local(child.tag) != "link":
            continue
        href = child.attrib.get("href")
        if href:
            # Atom: prefer rel="alternate" (the canonical permalink).
            if child.attrib.get("rel", "alternate") == "alternate":
                return href.strip()
            fallback = fallback or href.strip()
        elif child.text and child.text.strip():
            return child.text.strip()  # RSS 2.0 text link
    return fallback


def _cache_hint_minutes(channel: ET.Element) -> int:
    """Minutes to wait before re-polling.

    Prefers RSS 2.0 ``<ttl>`` (already in minutes); otherwise derives it from
    the syndication module's ``<sy:updatePeriod>`` / ``<sy:updateFrequency>``;
    returns 0 when the feed offers no hint.
    """
    for child in channel:
        if _local(child.tag) == "ttl" and child.text and child.text.strip().isdigit():
            return int(child.text.strip())

    period = ""
    frequency = 1
    for child in channel:
        if child.tag == f"{{{_SY_NS}}}updatePeriod" and child.text:
            period = child.text.strip().lower()
        elif (
            child.tag == f"{{{_SY_NS}}}updateFrequency"
            and child.text
            and child.text.strip().isdigit()
        ):
            frequency = max(1, int(child.text.strip()))

    if period in _PERIOD_MINUTES:
        return round(_PERIOD_MINUTES[period] / frequency)
    return 0


def _parse_feed(raw: bytes, feed_url: str, limit: int) -> dict[str, Any]:
    """Parse RSS 2.0 or Atom bytes into the capability's output dict.

    Raises ParseFailed if the bytes are not a parseable feed.
    """
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        raise ParseFailed(f"response is not parseable XML: {e}") from e

    if _local(root.tag) == "feed":  # Atom
        channel: ET.Element | None = root
        item_tag = "entry"
    else:  # RSS 2.0 / RDF — entries live under <channel>
        channel = next((c for c in root if _local(c.tag) == "channel"), None)
        item_tag = "item"
        if channel is None:
            raise ParseFailed(
                "not an RSS or Atom feed (no <channel> or <feed> element)"
            )

    raw_items = [c for c in channel if _local(c.tag) == item_tag]
    entries = [
        {
            "title": _text(it, "title"),
            "link": _link(it),
            "summary": _text(it, "summary", "description", "content"),
            "published": _text(it, "published", "pubDate", "updated", "date"),
            "id": _text(it, "id", "guid"),
        }
        for it in raw_items[:limit]
    ]

    return {
        "entries": entries,
        "entry_count": len(entries),
        "truncated": len(raw_items) > limit,
        "cache_hint_minutes": _cache_hint_minutes(channel),
        "feed_url": feed_url,
        "feed_title": _text(channel, "title"),
    }


def rss_fetch(
    url: str, limit: int | None = None, timeout: int | None = None
) -> dict[str, Any]:
    """Fetch an RSS/Atom feed and return its entries as structured fields.

    Args:
        url: Public http/https feed URL. file:// and other schemes are rejected.
        limit: Max entries to return (default 20, clamped to 1..100).
        timeout: Request timeout in seconds (default 15, clamped to 1..60).

    Returns:
        Dict with entries, entry_count, truncated, cache_hint_minutes,
        feed_url, feed_title.

    Raises:
        InvalidURL: url is malformed or non-http(s) — raised before any network.
        FetchFailed: the feed could not be retrieved.
        ParseFailed: the response is not a parseable feed.
    """
    _validate_url(url)  # synchronous — before any network work

    lim = DEFAULT_LIMIT if not limit else max(1, min(int(limit), MAX_LIMIT))
    tmo = DEFAULT_TIMEOUT if not timeout else max(1, min(int(timeout), MAX_TIMEOUT))

    raw, final_url = _fetch(url.strip(), tmo)
    return _parse_feed(raw, final_url, lim)
