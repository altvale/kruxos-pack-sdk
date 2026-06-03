"""Pytest plugin for KruxOS pack testing.

Automatically adds the pack's src/ directory to sys.path and provides
fixtures for common testing needs.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest
import yaml


def pytest_configure(config: Any) -> None:
    """Register the pack testing plugin markers."""
    config.addinivalue_line(
        "markers", "capability(name): mark test for a specific capability"
    )
    config.addinivalue_line(
        "markers", "requires_service: mark test as requiring external service"
    )


@pytest.fixture
def pack_manifest() -> dict[str, Any]:
    """Load and return the pack manifest from the current directory."""
    manifest_path = Path.cwd() / "manifest.yaml"
    if not manifest_path.exists():
        pytest.skip("No manifest.yaml in current directory")

    with open(manifest_path) as f:
        return yaml.safe_load(f)


@pytest.fixture
def pack_definitions(pack_manifest: dict[str, Any]) -> list[dict[str, Any]]:
    """Load all capability definitions from the pack."""
    all_defs: list[dict[str, Any]] = []

    for cap_path in pack_manifest.get("capabilities", []):
        full_path = Path.cwd() / cap_path
        if not full_path.exists():
            continue

        with open(full_path) as f:
            defs = yaml.safe_load(f)

        if isinstance(defs, list):
            all_defs.extend(defs)

    return all_defs
