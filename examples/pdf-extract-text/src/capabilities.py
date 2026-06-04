"""pdf-extract-text — Capability implementations.

Each function implements one capability defined in definitions/*.yaml.
The function name matches the capability name with dots replaced by underscores
(pdf.extract_text -> pdf_extract_text).
"""

from __future__ import annotations

import os
from typing import Any

PAGE_SEPARATOR = "\f"
MAX_PAGES_CEILING = 1000


class InvalidPath(ValueError):
    """The supplied path is missing, not a file, or not a .pdf."""


class ParseFailed(ValueError):
    """The file exists but could not be parsed as a PDF."""


def pdf_extract_text(path: str, max_pages: int | None = None) -> dict[str, Any]:
    """Extract text from a PDF file in the workspace.

    Args:
        path: Path to a PDF file.
        max_pages: Optional cap on pages to extract (0/None = all; clamped to 1000).

    Returns:
        Dict with text, page_count, pages_extracted, char_count, truncated.

    Raises:
        InvalidPath: path is empty / not a .pdf / not an existing file.
        ParseFailed: the file is not a parseable PDF.
    """
    if not path or not isinstance(path, str):
        raise InvalidPath("path must be a non-empty string")
    if not path.lower().endswith(".pdf"):
        raise InvalidPath(f"not a .pdf file: {path!r}")
    if not os.path.isfile(path):
        raise InvalidPath(f"no such file: {path!r}")

    try:
        from pypdf import PdfReader
    except ImportError as e:  # pragma: no cover
        raise ParseFailed("pypdf is required but not installed (pip install pypdf)") from e

    try:
        reader = PdfReader(path)
        total_pages = len(reader.pages)
    except Exception as e:  # noqa: BLE001 - any reader failure means "not a usable PDF"
        raise ParseFailed(f"could not parse PDF {path!r}: {e}") from e

    # Clamp max_pages: None/0 => all; otherwise 1..ceiling.
    limit = total_pages if not max_pages else max(1, min(int(max_pages), MAX_PAGES_CEILING))
    extract_n = min(limit, total_pages)

    parts = []
    for i in range(extract_n):
        try:
            parts.append(reader.pages[i].extract_text() or "")
        except Exception as e:  # noqa: BLE001
            raise ParseFailed(f"failed extracting page {i}: {e}") from e

    text = PAGE_SEPARATOR.join(parts)
    return {
        "text": text,
        "page_count": total_pages,
        "pages_extracted": extract_n,
        "char_count": len(text),
        "truncated": extract_n < total_pages,
    }
