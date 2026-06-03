"""Tests for {{pack_name}} capabilities."""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from capabilities import {{capability_prefix}}_example


class TestExample:
    def test_basic_invocation(self):
        result = {{capability_prefix}}_example(input_value="hello")
        assert result["result"] == "Processed: hello"
        assert "metadata" in result

    def test_with_options(self):
        result = {{capability_prefix}}_example(
            input_value="test", options={"verbose": True}
        )
        assert result["metadata"]["options_provided"] is True

    def test_empty_input_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            {{capability_prefix}}_example(input_value="")

    def test_output_structure(self):
        result = {{capability_prefix}}_example(input_value="check")
        assert "result" in result
        assert "metadata" in result
        assert isinstance(result["result"], str)
        assert isinstance(result["metadata"], dict)
