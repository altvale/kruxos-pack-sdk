"""Tests for the standalone pack capability runner.

The runner is invoked by `crates/gateway/src/pack_handler.rs` as a
subprocess — these tests exercise it the same way (real subprocess, real
stdin/stdout) so the contract documented in `pack_runner.py`'s module
docstring is what's verified.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

RUNNER = Path(__file__).resolve().parent.parent / "pack_runner.py"


def _make_pack(tmp_path: Path, capabilities_py: str) -> Path:
    """Build a minimal pack tree (manifest + src/capabilities.py) under tmp_path."""
    pack_dir = tmp_path / "fixture-pack"
    src_dir = pack_dir / "src"
    src_dir.mkdir(parents=True)
    (pack_dir / "manifest.yaml").write_text(
        "name: fixture-pack\nversion: '1.0.0'\npack_type: python\n"
    )
    (src_dir / "capabilities.py").write_text(capabilities_py)
    return pack_dir


def _run(
    pack_dir: Path, capability_name: str, stdin_obj: object | None
) -> subprocess.CompletedProcess[str]:
    stdin = "" if stdin_obj is None else json.dumps(stdin_obj)
    return subprocess.run(
        [sys.executable, str(RUNNER), str(pack_dir), capability_name],
        input=stdin,
        capture_output=True,
        text=True,
        timeout=10,
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_dispatch_returns_envelope_on_success(tmp_path: Path) -> None:
    pack_dir = _make_pack(
        tmp_path,
        "def example_echo(message): return {'echo': message}\n",
    )
    proc = _run(pack_dir, "example.echo", {"message": "hello"})
    assert proc.returncode == 0, proc.stderr
    envelope = json.loads(proc.stdout)
    assert envelope == {"ok": True, "result": {"echo": "hello"}}


def test_dotted_names_dispatch_to_underscored_functions(tmp_path: Path) -> None:
    pack_dir = _make_pack(
        tmp_path,
        "def my_pack_do_thing(**kwargs): return {'kw_count': len(kwargs)}\n",
    )
    proc = _run(pack_dir, "my_pack.do_thing", {"a": 1, "b": 2})
    assert proc.returncode == 0, proc.stderr
    assert json.loads(proc.stdout) == {"ok": True, "result": {"kw_count": 2}}


def test_empty_stdin_passes_no_kwargs(tmp_path: Path) -> None:
    pack_dir = _make_pack(
        tmp_path,
        "def fixture_no_args(): return {'called': True}\n",
    )
    proc = _run(pack_dir, "fixture.no_args", None)
    assert proc.returncode == 0, proc.stderr
    assert json.loads(proc.stdout) == {"ok": True, "result": {"called": True}}


# ---------------------------------------------------------------------------
# Capability-level errors → envelope, exit 0
# ---------------------------------------------------------------------------


def test_capability_exception_serializes_to_error_envelope(tmp_path: Path) -> None:
    pack_dir = _make_pack(
        tmp_path,
        "def fixture_boom():\n    raise ValueError('something bad')\n",
    )
    proc = _run(pack_dir, "fixture.boom", {})
    assert proc.returncode == 0, proc.stderr
    envelope = json.loads(proc.stdout)
    assert envelope["ok"] is False
    assert envelope["error"]["type"] == "ValueError"
    assert envelope["error"]["message"] == "something bad"
    assert "ValueError" in envelope["error"]["traceback"]


def test_non_dict_return_is_envelope_error(tmp_path: Path) -> None:
    pack_dir = _make_pack(
        tmp_path,
        "def fixture_bad_return(): return [1, 2, 3]\n",
    )
    proc = _run(pack_dir, "fixture.bad_return", {})
    assert proc.returncode == 0, proc.stderr
    envelope = json.loads(proc.stdout)
    assert envelope["ok"] is False
    assert envelope["error"]["type"] == "InvalidReturn"
    assert "list" in envelope["error"]["message"]


def test_typeerror_from_bad_kwargs_is_envelope_error(tmp_path: Path) -> None:
    # Missing required arg → capability TypeError → envelope (NOT a runner-level
    # failure). Gateway maps this to a structured capability error.
    pack_dir = _make_pack(
        tmp_path,
        "def fixture_needs_arg(required_arg): return {'got': required_arg}\n",
    )
    proc = _run(pack_dir, "fixture.needs_arg", {})
    assert proc.returncode == 0, proc.stderr
    envelope = json.loads(proc.stdout)
    assert envelope["ok"] is False
    assert envelope["error"]["type"] == "TypeError"
    assert "required_arg" in envelope["error"]["message"]


# ---------------------------------------------------------------------------
# Runner-level failures → non-zero exit, stderr message
# ---------------------------------------------------------------------------


def test_missing_pack_dir_exits_nonzero(tmp_path: Path) -> None:
    proc = _run(tmp_path / "does-not-exist", "fixture.thing", {})
    assert proc.returncode != 0
    assert "pack directory not found" in proc.stderr


def test_missing_capabilities_module_exits_nonzero(tmp_path: Path) -> None:
    pack_dir = tmp_path / "no-src-pack"
    pack_dir.mkdir()
    (pack_dir / "manifest.yaml").write_text("name: no-src\nversion: '1.0.0'\n")
    proc = _run(pack_dir, "fixture.thing", {})
    assert proc.returncode != 0
    assert "capabilities module not found" in proc.stderr


def test_missing_function_exits_nonzero(tmp_path: Path) -> None:
    pack_dir = _make_pack(tmp_path, "def something_else(): return {}\n")
    proc = _run(pack_dir, "missing.func", {})
    assert proc.returncode != 0
    assert "missing_func" in proc.stderr
    assert "not found in capabilities module" in proc.stderr


def test_invalid_json_stdin_exits_nonzero(tmp_path: Path) -> None:
    pack_dir = _make_pack(tmp_path, "def fixture_x(**kw): return {}\n")
    proc = subprocess.run(
        [sys.executable, str(RUNNER), str(pack_dir), "fixture.x"],
        input="not-json{",
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert proc.returncode != 0
    assert "stdin is not valid JSON" in proc.stderr


def test_non_object_json_stdin_exits_nonzero(tmp_path: Path) -> None:
    pack_dir = _make_pack(tmp_path, "def fixture_x(**kw): return {}\n")
    proc = subprocess.run(
        [sys.executable, str(RUNNER), str(pack_dir), "fixture.x"],
        input="[1, 2, 3]",
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert proc.returncode != 0
    assert "must be an object" in proc.stderr


def test_wrong_argv_exits_nonzero(tmp_path: Path) -> None:
    proc = subprocess.run(
        [sys.executable, str(RUNNER), str(tmp_path)],
        input="",
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert proc.returncode != 0
    assert "positional args" in proc.stderr


def test_underscore_prefixed_kwargs_are_stripped_before_call(tmp_path: Path) -> None:
    """Regression test for GH #474.

    The gateway's capability protocol attaches internal envelope fields
    like `_context` to every dispatch. The runner must strip these before
    invoking the pack function — pack functions follow the declared
    schema and don't accept underscore-prefixed extras.
    """
    pack_dir = _make_pack(
        tmp_path,
        # Function with explicit signature — would TypeError if _context
        # was passed through.
        "def fixture_echo(message: str):\n"
        "    return {'echoed': message}\n",
    )
    proc = _run(
        pack_dir,
        "fixture.echo",
        {
            "message": "hi",
            "_context": {"agent_id": "test-agent", "session_id": "abc"},
            "_internal_flag": True,
        },
    )
    assert proc.returncode == 0, proc.stderr
    envelope = json.loads(proc.stdout)
    assert envelope["ok"] is True
    assert envelope["result"] == {"echoed": "hi"}


# ---------------------------------------------------------------------------
# Real seed pack integration
# ---------------------------------------------------------------------------


REPO_ROOT = Path(__file__).resolve().parents[3]
HELLO_WORLD = REPO_ROOT / "registry" / "packs" / "hello-world"


@pytest.mark.skipif(
    not (HELLO_WORLD / "src" / "capabilities.py").is_file(),
    reason="hello-world seed pack not present (running outside repo checkout?)",
)
def test_hello_world_seed_pack_dispatches() -> None:
    proc = _run(HELLO_WORLD, "hello_world.echo", {"message": "Slot Z"})
    assert proc.returncode == 0, proc.stderr
    envelope = json.loads(proc.stdout)
    assert envelope["ok"] is True
    assert envelope["result"]["greeting"] == "Hello from KruxOS! Slot Z"
    assert envelope["result"]["original"] == "Slot Z"
