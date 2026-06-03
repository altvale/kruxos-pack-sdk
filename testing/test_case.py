"""PackTestCase — base test class for capability pack testing.

Provides helper methods for invoking capabilities and asserting on results
following the KruxOS capability contract.
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest
import yaml


class PackTestCase:
    """Base test class for capability pack tests.

    Automatically loads the pack manifest and provides helpers for
    calling capabilities and asserting on results.

    Usage:
        class TestMyPack(PackTestCase):
            pack_dir = "."  # optional, defaults to cwd

            def test_query_returns_results(self):
                result = self.call("my_service.query", query="test")
                self.assert_success(result)
                self.assert_has_field(result, "results")
    """

    pack_dir: str = "."

    @pytest.fixture(autouse=True)
    def _setup_pack(self) -> None:
        """Load the pack manifest and set up the source path."""
        pack_path = Path(self.pack_dir).resolve()
        manifest_path = pack_path / "manifest.yaml"

        if not manifest_path.exists():
            pytest.skip(f"No manifest.yaml at {pack_path}")

        with open(manifest_path) as f:
            self._manifest = yaml.safe_load(f)

        src_path = str(pack_path / "src")
        if src_path not in sys.path:
            sys.path.insert(0, src_path)

        self._pack_path = pack_path

    @property
    def manifest(self) -> dict[str, Any]:
        """Return the parsed pack manifest."""
        return self._manifest

    @property
    def pack_name(self) -> str:
        """Return the pack name from the manifest."""
        return self._manifest.get("name", "")

    @property
    def capability_prefix(self) -> str:
        """Return the capability prefix derived from the pack name."""
        return self.pack_name.replace("-", "_").removesuffix("_pack")

    def call(self, capability_name: str, **kwargs: Any) -> dict[str, Any]:
        """Invoke a capability function by its dotted name.

        Translates a capability name like "my_service.query" into a function
        call to my_service_query() in the pack's src/capabilities module.

        Args:
            capability_name: Dotted capability name (e.g., "my_pack.example").
            **kwargs: Arguments to pass to the capability function.

        Returns:
            The result dict from the capability function.
        """
        func_name = capability_name.replace(".", "_")

        try:
            mod = importlib.import_module("capabilities")
        except ModuleNotFoundError as e:
            pytest.fail(f"Could not import capabilities module: {e}")

        func = getattr(mod, func_name, None)
        if func is None:
            pytest.fail(
                f"Capability function '{func_name}' not found in capabilities module"
            )

        return func(**kwargs)

    def assert_success(self, result: dict[str, Any]) -> None:
        """Assert that a capability result indicates success."""
        assert isinstance(result, dict), f"Expected dict result, got {type(result)}"
        if "error" in result:
            pytest.fail(f"Capability returned error: {result['error']}")

    def assert_has_field(self, result: dict[str, Any], field: str) -> None:
        """Assert that a result dict contains a specific field."""
        assert field in result, (
            f"Expected field '{field}' in result. "
            f"Got keys: {list(result.keys())}"
        )

    def assert_field_type(
        self, result: dict[str, Any], field: str, expected_type: type
    ) -> None:
        """Assert that a result field has the expected type."""
        self.assert_has_field(result, field)
        actual = result[field]
        assert isinstance(actual, expected_type), (
            f"Expected '{field}' to be {expected_type.__name__}, "
            f"got {type(actual).__name__}"
        )

    def assert_approval_required(self, result: dict[str, Any]) -> None:
        """Assert that a capability result indicates approval is required."""
        assert isinstance(result, dict)
        status = result.get("status", "")
        assert status in ("buffered", "approval_required", "pending"), (
            f"Expected approval-required status, got '{status}'"
        )

    def assert_error_type(self, result: dict[str, Any], error_type: str) -> None:
        """Assert that a result contains a specific error type."""
        assert "error" in result, "Expected an error in result"
        err = result["error"]
        if isinstance(err, dict):
            assert err.get("type") == error_type, (
                f"Expected error type '{error_type}', got '{err.get('type')}'"
            )
        elif isinstance(err, str):
            assert error_type in err, (
                f"Expected error containing '{error_type}', got '{err}'"
            )

    def load_definition(self, capability_name: str) -> dict[str, Any] | None:
        """Load the YAML definition for a specific capability.

        Args:
            capability_name: The dotted capability name.

        Returns:
            The capability definition dict, or None if not found.
        """
        for cap_path in self._manifest.get("capabilities", []):
            full_path = self._pack_path / cap_path
            if not full_path.exists():
                continue

            with open(full_path) as f:
                definitions = yaml.safe_load(f)

            if not isinstance(definitions, list):
                continue

            for defn in definitions:
                if defn.get("name") == capability_name:
                    return defn

        return None


def mock_capability(module_name: str, func_name: str, return_value: Any = None) -> MagicMock:
    """Create a mock for a capability function.

    Useful for testing packs that depend on other capabilities.

    Args:
        module_name: The module to mock (e.g., "capabilities").
        func_name: The function name to mock.
        return_value: Value to return when the mock is called.

    Returns:
        A MagicMock configured to return the specified value.
    """
    mock = MagicMock(return_value=return_value or {"result": "mocked"})
    mock.__name__ = func_name

    if module_name in sys.modules:
        setattr(sys.modules[module_name], func_name, mock)
    else:
        mod = MagicMock()
        setattr(mod, func_name, mock)
        sys.modules[module_name] = mod

    return mock
