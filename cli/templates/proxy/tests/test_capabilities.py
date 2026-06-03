"""Tests for {{pack_name}} capabilities."""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from capabilities import {{capability_prefix}}_query, {{capability_prefix}}_write


class TestQuery:
    def test_returns_results_structure(self):
        result = {{capability_prefix}}_query(query="status:active")
        assert "results" in result
        assert "count" in result
        assert "synced_at" in result

    def test_respects_limit(self):
        result = {{capability_prefix}}_query(query="all", limit=10)
        assert isinstance(result["results"], list)

    def test_count_is_integer(self):
        result = {{capability_prefix}}_query(query="test")
        assert isinstance(result["count"], int)


class TestWrite:
    def test_create_action_buffers(self):
        result = {{capability_prefix}}_write(action="create", data={"name": "test"})
        assert result["status"] == "buffered"
        assert "write_id" in result

    def test_invalid_action_raises(self):
        with pytest.raises(ValueError, match="Invalid action"):
            {{capability_prefix}}_write(action="invalid", data={})

    def test_update_action_buffers(self):
        result = {{capability_prefix}}_write(action="update", data={"id": "1", "name": "updated"})
        assert result["status"] == "buffered"

    def test_delete_action_buffers(self):
        result = {{capability_prefix}}_write(action="delete", data={"id": "1"})
        assert result["status"] == "buffered"
