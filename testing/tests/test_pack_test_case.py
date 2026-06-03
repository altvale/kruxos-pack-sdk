"""Tests for the PackTestCase base class and mock_capability helper."""

import os
import sys
import tempfile
from pathlib import Path

# Ensure the testing package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import pytest
import yaml

from testing.test_case import PackTestCase, mock_capability


@pytest.fixture
def sample_pack(tmp_path):
    """Create a minimal sample pack for testing."""
    manifest = {
        "name": "test-pack",
        "version": "1.0.0",
        "description": "Test pack for testing the testing framework",
        "kruxos_version": ">=0.0.1",
        "pack_type": "python",
        "capabilities": ["definitions/example.yaml"],
        "dependencies": [],
        "secrets_required": [],
        "security": {
            "network_egress": [],
            "filesystem": "workspace_only",
            "syscalls": [],
        },
        "default_policies": {"test_pack.example": "autonomous"},
    }

    definitions = [
        {
            "name": "test_pack.example",
            "version": "1.0",
            "purpose": "Example capability for testing.",
            "when_to_use": "Use when testing the test framework.",
            "inputs": [
                {
                    "name": "input_value",
                    "type": "String",
                    "required": True,
                    "description": "Test input value.",
                }
            ],
            "outputs": [
                {
                    "name": "result",
                    "type": "String",
                    "description": "The result.",
                }
            ],
            "side_effects": [],
            "common_patterns": [
                {
                    "description": "Basic usage",
                    "steps": ["test_pack.example(input_value='test')"],
                }
            ],
            "errors": [
                {
                    "type": "InvalidInput",
                    "description": "Bad input.",
                    "recovery": [
                        {"action": "retry", "description": "Fix input."}
                    ],
                }
            ],
            "permission_tier": "autonomous",
            "tags": ["test_pack", "example"],
        }
    ]

    (tmp_path / "manifest.yaml").write_text(yaml.dump(manifest))
    (tmp_path / "definitions").mkdir()
    (tmp_path / "definitions" / "example.yaml").write_text(yaml.dump(definitions))
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "capabilities.py").write_text(
        'def test_pack_example(input_value="", options=None):\n'
        '    if not input_value:\n'
        '        raise ValueError("Empty input")\n'
        '    return {"result": f"processed: {input_value}", "metadata": {}}\n'
    )
    (tmp_path / "tests").mkdir()

    return tmp_path


class TestPackTestCase:
    """Test the PackTestCase base class using a real sample pack."""

    def test_assert_success_with_valid_result(self):
        tc = PackTestCase()
        tc.assert_success({"result": "ok"})

    def test_assert_success_fails_on_error(self):
        tc = PackTestCase()
        with pytest.raises(pytest.fail.Exception, match="error"):
            tc.assert_success({"error": "something went wrong"})

    def test_assert_has_field(self):
        tc = PackTestCase()
        tc.assert_has_field({"foo": "bar"}, "foo")

    def test_assert_has_field_fails(self):
        tc = PackTestCase()
        with pytest.raises(AssertionError, match="Expected field 'foo'"):
            tc.assert_has_field({"bar": 1}, "foo")

    def test_assert_field_type(self):
        tc = PackTestCase()
        tc.assert_field_type({"count": 42}, "count", int)

    def test_assert_field_type_fails(self):
        tc = PackTestCase()
        with pytest.raises(AssertionError, match="Expected 'count' to be int"):
            tc.assert_field_type({"count": "not_int"}, "count", int)

    def test_assert_approval_required(self):
        tc = PackTestCase()
        tc.assert_approval_required({"status": "buffered", "write_id": "123"})
        tc.assert_approval_required({"status": "approval_required"})
        tc.assert_approval_required({"status": "pending"})

    def test_assert_approval_required_fails(self):
        tc = PackTestCase()
        with pytest.raises(AssertionError, match="approval-required"):
            tc.assert_approval_required({"status": "executed"})

    def test_assert_error_type_dict(self):
        tc = PackTestCase()
        tc.assert_error_type({"error": {"type": "NotFound"}}, "NotFound")

    def test_assert_error_type_string(self):
        tc = PackTestCase()
        tc.assert_error_type({"error": "NotFound: item missing"}, "NotFound")

    def test_assert_error_type_fails_no_error(self):
        tc = PackTestCase()
        with pytest.raises(AssertionError, match="Expected an error"):
            tc.assert_error_type({"result": "ok"}, "NotFound")


class TestMockCapability:
    def test_mock_returns_value(self):
        mock = mock_capability("test_module_abc", "test_func", {"mocked": True})
        result = mock()
        assert result == {"mocked": True}

    def test_mock_default_return(self):
        mock = mock_capability("test_module_def", "test_func")
        result = mock()
        assert result == {"result": "mocked"}

    def test_mock_installed_in_sys_modules(self):
        mock_capability("mock_test_mod", "my_func", {"ok": True})
        mod = sys.modules["mock_test_mod"]
        assert mod.my_func() == {"ok": True}
        del sys.modules["mock_test_mod"]


class TestLoadDefinition:
    def test_load_existing_definition(self, sample_pack):
        tc = PackTestCase()
        tc.pack_dir = str(sample_pack)
        tc._setup_pack_manual(sample_pack)

        defn = tc.load_definition("test_pack.example")
        assert defn is not None
        assert defn["name"] == "test_pack.example"

    def test_load_nonexistent_definition(self, sample_pack):
        tc = PackTestCase()
        tc.pack_dir = str(sample_pack)
        tc._setup_pack_manual(sample_pack)

        defn = tc.load_definition("test_pack.nonexistent")
        assert defn is None


# Add a manual setup method for tests that don't use pytest fixtures
# (we can't use the autouse fixture outside the normal test flow)
def _setup_pack_manual(self, pack_path):
    manifest_path = pack_path / "manifest.yaml"
    with open(manifest_path) as f:
        self._manifest = yaml.safe_load(f)
    src_path = str(pack_path / "src")
    if src_path not in sys.path:
        sys.path.insert(0, src_path)
    self._pack_path = pack_path


PackTestCase._setup_pack_manual = _setup_pack_manual
