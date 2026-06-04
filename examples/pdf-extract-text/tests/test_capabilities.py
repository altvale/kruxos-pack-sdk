"""Tests for pdf-extract-text capabilities."""

import base64
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from capabilities import pdf_extract_text, InvalidPath, ParseFailed  # noqa: E402

# A tiny real PDF containing "Hello KruxOS PDF" + "Second line of text."
# (minted with fpdf2; the test only needs pypdf to read it.)
_FIXTURE_B64 = (
    "JVBERi0xLjMKJenr8b8KMSAwIG9iago8PAovQ291bnQgMQovS2lkcyBbMyAwIFJdCi9NZWRpYUJv"
    "eCBbMCAwIDU5NS4yOCA4NDEuODldCi9UeXBlIC9QYWdlcwo+PgplbmRvYmoKMiAwIG9iago8PAov"
    "T3BlbkFjdGlvbiBbMyAwIFIgL0ZpdEggbnVsbF0KL1BhZ2VMYXlvdXQgL09uZUNvbHVtbgovUGFn"
    "ZXMgMSAwIFIKL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDQg"
    "MCBSCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyA2IDAgUgovVHlwZSAvUGFnZQo+PgplbmRvYmoK"
    "NCAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovTGVuZ3RoIDExMAo+PgpzdHJlYW0KeJwz"
    "UvDiMtAzNVco53IKUdB3M1QwNNMzMFAISVNwDQEJGRvqGVoomFuagBSFpChoeKTm5OQreBeVVvgH"
    "KwS4uGkqhGRB1YK1G2HTbmaoZ24K1h6cmpyfl6KQk5mXqpCfplCSWlGiBzMCAAb/IpwKZW5kc3Ry"
    "ZWFtCmVuZG9iago1IDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhCi9FbmNvZGluZyAvV2lu"
    "QW5zaUVuY29kaW5nCi9TdWJ0eXBlIC9UeXBlMQovVHlwZSAvRm9udAo+PgplbmRvYmoKNiAwIG9i"
    "ago8PAovRm9udCA8PC9GMSA1IDAgUj4+Ci9Qcm9jU2V0IFsvUERGIC9UZXh0IC9JbWFnZUIgL0lt"
    "YWdlQyAvSW1hZ2VJXQo+PgplbmRvYmoKNyAwIG9iago8PAovQ3JlYXRpb25EYXRlIChEOjIwMjYw"
    "NjAyMDc0MzUyWikKPj4KZW5kb2JqCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAw"
    "MDAxNSAwMDAwMCBuIAowMDAwMDAwMTAyIDAwMDAwIG4gCjAwMDAwMDAyMDUgMDAwMDAgbiAKMDAw"
    "MDAwMDI4NSAwMDAwMCBuIAowMDAwMDAwNDY3IDAwMDAwIG4gCjAwMDAwMDA1NjQgMDAwMDAgbiAK"
    "MDAwMDAwMDY1MSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDgKL1Jvb3QgMiAwIFIKL0luZm8g"
    "NyAwIFIKL0lEIFs8MEFDMTBFMUVCMzQ1QzVGODQ0QkQ1MEU2Mjk5MjNEMjI+PDBBQzEwRTFFQjM0"
    "NUM1Rjg0NEJENTBFNjI5OTIzRDIyPl0KPj4Kc3RhcnR4cmVmCjcwNgolJUVPRgo="
)


@pytest.fixture
def sample_pdf(tmp_path):
    p = tmp_path / "sample.pdf"
    p.write_bytes(base64.b64decode(_FIXTURE_B64))
    return str(p)


class TestPdfExtractText:
    def test_extracts_text(self, sample_pdf):
        r = pdf_extract_text(sample_pdf)
        assert "Hello KruxOS PDF" in r["text"]
        assert r["page_count"] == 1
        assert r["pages_extracted"] == 1
        assert r["char_count"] == len(r["text"])
        assert r["truncated"] is False

    def test_max_pages_clamp(self, sample_pdf):
        r = pdf_extract_text(sample_pdf, max_pages=1)
        assert r["pages_extracted"] == 1
        assert r["truncated"] is False

    def test_missing_file_raises(self):
        with pytest.raises(InvalidPath):
            pdf_extract_text("/tmp/definitely-not-here.pdf")

    def test_non_pdf_raises(self, tmp_path):
        f = tmp_path / "note.txt"
        f.write_text("hi")
        with pytest.raises(InvalidPath):
            pdf_extract_text(str(f))

    def test_corrupt_pdf_raises(self, tmp_path):
        bad = tmp_path / "bad.pdf"
        bad.write_bytes(b"this is not a pdf at all")
        with pytest.raises(ParseFailed):
            pdf_extract_text(str(bad))
