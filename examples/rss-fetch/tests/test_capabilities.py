"""Tests for kruxos-rss-fetch.

Each test maps to one of the seven Capability Design Guidelines. The network
primitive (`_fetch`) is monkeypatched so the suite runs fully offline.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import capabilities as cap  # noqa: E402
from capabilities import (  # noqa: E402
    FetchFailed,
    InvalidURL,
    ParseFailed,
    rss_fetch,
)

RSS2 = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com</link>
    <ttl>30</ttl>
    <item>
      <title>First post</title>
      <link>https://example.com/1</link>
      <description>The first item.</description>
      <pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate>
      <guid>https://example.com/1</guid>
    </item>
    <item>
      <title>Second post</title>
      <link>https://example.com/2</link>
      <description>The second item.</description>
      <pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate>
      <guid>https://example.com/2</guid>
    </item>
    <item>
      <title>Third post</title>
      <link>https://example.com/3</link>
      <description>The third item.</description>
      <pubDate>Sun, 31 May 2026 10:00:00 GMT</pubDate>
      <guid>https://example.com/3</guid>
    </item>
  </channel>
</rss>
"""

# No <ttl>; cache hint must come from the syndication module:
# hourly / 2 updates-per-period => every 30 minutes.
RSS_SY = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:sy="http://purl.org/rss/1.0/modules/syndication/">
  <channel>
    <title>Syndicated Feed</title>
    <sy:updatePeriod>hourly</sy:updatePeriod>
    <sy:updateFrequency>2</sy:updateFrequency>
    <item><title>Only post</title><link>https://example.com/x</link></item>
  </channel>
</rss>
"""

ATOM = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <entry>
    <title>Atom One</title>
    <link href="https://example.com/a1" rel="alternate"/>
    <summary>An atom entry.</summary>
    <published>2026-06-02T10:00:00Z</published>
    <id>tag:example.com,2026:1</id>
  </entry>
</feed>
"""


def _serve(monkeypatch, body, final_url="https://example.com/feed.xml"):
    """Replace the network primitive with a canned response."""
    monkeypatch.setattr(cap, "_fetch", lambda url, timeout: (body, final_url))


# Rule 2 — validate at the boundary (synchronously, before any network).
class TestBoundaryValidation:
    @pytest.mark.parametrize(
        "bad",
        ["", "file:///etc/passwd", "ftp://example.com/feed", "not-a-url", "/local/path"],
    )
    def test_bad_url_raises_invalidurl(self, monkeypatch, bad):
        # If validation is synchronous, the network is never touched.
        def explode(*_a, **_k):
            raise AssertionError("network touched before URL validation")

        monkeypatch.setattr(cap, "_fetch", explode)
        with pytest.raises(InvalidURL):
            rss_fetch(bad)


# Rule 5 — typed errors that subclass the generic builtins, with recovery.
class TestTypedErrors:
    def test_error_class_hierarchy(self):
        assert issubclass(InvalidURL, ValueError)
        assert issubclass(FetchFailed, ConnectionError)
        assert issubclass(ParseFailed, SyntaxError)

    def test_invalidurl_catchable_as_valueerror(self, monkeypatch):
        monkeypatch.setattr(cap, "_fetch", lambda *a, **k: (b"", ""))
        with pytest.raises(ValueError):
            rss_fetch("file:///etc/passwd")

    def test_fetchfailed_propagates_and_is_connectionerror(self, monkeypatch):
        def boom(url, timeout):
            raise FetchFailed("boom")

        monkeypatch.setattr(cap, "_fetch", boom)
        with pytest.raises(ConnectionError):
            rss_fetch("https://example.com/feed.xml")

    def test_non_feed_raises_parsefailed(self, monkeypatch):
        _serve(monkeypatch, b"<html><body>not a feed</body></html>")
        with pytest.raises(ParseFailed):
            rss_fetch("https://example.com/page.html")

    def test_invalid_xml_raises_parsefailed_as_syntaxerror(self, monkeypatch):
        _serve(monkeypatch, b"this is not xml <<<")
        with pytest.raises(SyntaxError):
            rss_fetch("https://example.com/feed.xml")


# Rule 3 — pre-parsed output: entries[].* are ready-to-use strings.
class TestPreParsedOutput:
    def test_rss2_entries_are_strings(self, monkeypatch):
        _serve(monkeypatch, RSS2)
        r = rss_fetch("https://example.com/feed.xml")
        assert r["feed_title"] == "Example Feed"
        first = r["entries"][0]
        assert first["title"] == "First post"
        assert first["link"] == "https://example.com/1"
        assert first["summary"] == "The first item."
        assert first["published"].startswith("Tue, 02 Jun 2026")
        assert first["id"] == "https://example.com/1"
        assert all(isinstance(v, str) for v in first.values())

    def test_atom_entries_parsed(self, monkeypatch):
        _serve(monkeypatch, ATOM)
        r = rss_fetch("https://example.com/atom.xml")
        entry = r["entries"][0]
        assert entry["title"] == "Atom One"
        assert entry["link"] == "https://example.com/a1"
        assert entry["id"] == "tag:example.com,2026:1"
        assert entry["summary"] == "An atom entry."


# Rule 6 — defaults that work, ceilings that clamp.
class TestDefaultsAndCeilings:
    def test_default_limit_returns_all_when_fewer(self, monkeypatch):
        _serve(monkeypatch, RSS2)
        r = rss_fetch("https://example.com/feed.xml")  # default limit 20
        assert r["entry_count"] == 3
        assert r["truncated"] is False

    def test_limit_truncates(self, monkeypatch):
        _serve(monkeypatch, RSS2)
        r = rss_fetch("https://example.com/feed.xml", limit=2)
        assert r["entry_count"] == 2
        assert r["truncated"] is True

    def test_oversized_limit_is_clamped_silently(self, monkeypatch):
        _serve(monkeypatch, RSS2)
        r = rss_fetch("https://example.com/feed.xml", limit=10_000)
        # Clamped to 100; only 3 items exist, so not truncated.
        assert r["entry_count"] == 3
        assert r["truncated"] is False


# Rule 7 — convenience aggregates: truncated, cache_hint_minutes, feed_url, entry_count.
class TestConvenienceAggregates:
    def test_cache_hint_from_rss_ttl(self, monkeypatch):
        _serve(monkeypatch, RSS2)
        r = rss_fetch("https://example.com/feed.xml")
        assert r["cache_hint_minutes"] == 30

    def test_cache_hint_from_syndication_module(self, monkeypatch):
        _serve(monkeypatch, RSS_SY)
        r = rss_fetch("https://example.com/feed.xml")
        assert r["cache_hint_minutes"] == 30  # hourly / frequency 2

    def test_feed_url_reflects_final_redirect_target(self, monkeypatch):
        _serve(monkeypatch, RSS2, final_url="https://cdn.example.com/feed.xml")
        r = rss_fetch("https://example.com/feed.xml")
        assert r["feed_url"] == "https://cdn.example.com/feed.xml"

    def test_entry_count_matches_entries(self, monkeypatch):
        _serve(monkeypatch, RSS2)
        r = rss_fetch("https://example.com/feed.xml")
        assert r["entry_count"] == len(r["entries"])
