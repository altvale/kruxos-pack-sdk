#!/usr/bin/env python3
"""KruxOS pack capability runner.

Invoked by the gateway (`crates/gateway/src/pack_handler.rs`) as:

    python3 pack_runner.py <pack_dir> <capability_name>

with JSON kwargs on stdin and a JSON envelope on stdout.

The runner is intentionally standalone: it imports only the stdlib so the
appliance can ship it without pulling in `kruxos` SDK modules. It implements
the v0.0.2 pack capability contract documented in
`docs/internal/pack-registry.md`:

    pack_dir/manifest.yaml         (pack_type: python)
    pack_dir/src/capabilities.py   (sync def name_with_underscores(**kwargs) -> dict)

Dotted capability names dispatch to underscored function names — `hash.sha256`
calls `hash_sha256(...)`. The function receives JSON-decoded stdin as kwargs
and must return a dict (everything else is surfaced as a capability error).

Stdout envelope (exit 0):

    {"ok": true, "result": {...}}                          # success
    {"ok": false, "error": {"type": "...", "message": "...",
                              "traceback": "..."}}         # capability raised
                                                           # or returned non-dict

Runner-level failures (bad argv, missing pack dir, missing capabilities
module, missing function, malformed stdin) exit non-zero with a one-line
message on stderr. The gateway maps those to a structured
`pack.runner_error` capability error.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import traceback
from pathlib import Path
from typing import Any, NoReturn


def _die(msg: str, code: int = 1) -> NoReturn:
    print(f"pack_runner: {msg}", file=sys.stderr)
    sys.exit(code)


def _read_stdin_kwargs() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        _die(f"stdin is not valid JSON: {exc}")
    if not isinstance(parsed, dict):
        _die(f"stdin JSON must be an object, got {type(parsed).__name__}")
    return parsed


def _load_capabilities_module(pack_dir: Path) -> Any:
    src_dir = pack_dir / "src"
    cap_file = src_dir / "capabilities.py"
    if not cap_file.is_file():
        _die(f"capabilities module not found at {cap_file}")

    # Make src/ importable so capabilities.py can `import helpers` from a
    # sibling file without polluting other capability functions.
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))

    # Load capabilities.py under a private module name. Don't reuse
    # `capabilities` directly — that name is also used by KruxOS's own
    # `capabilities` Rust crate paths in places and we want zero risk of
    # collision with anything the appliance has on PYTHONPATH.
    spec = importlib.util.spec_from_file_location(
        "_kruxos_pack_capabilities", cap_file
    )
    if spec is None or spec.loader is None:
        _die(f"failed to build import spec for {cap_file}")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        _die(f"failed to import capabilities module: {exc}")
    return module


def _resolve_function(module: Any, capability_name: str) -> Any:
    func_name = capability_name.replace(".", "_")
    func = getattr(module, func_name, None)
    if func is None or not callable(func):
        _die(
            f"capability function '{func_name}' "
            f"(for capability '{capability_name}') not found in capabilities module"
        )
    return func


def _write_envelope(envelope: dict[str, Any]) -> None:
    try:
        sys.stdout.write(json.dumps(envelope))
    except (TypeError, ValueError) as exc:
        _die(f"result not JSON-serializable: {exc}")
    sys.stdout.write("\n")
    sys.stdout.flush()


def main(argv: list[str]) -> None:
    if len(argv) != 3:
        _die(
            f"expected 2 positional args (<pack_dir> <capability_name>), "
            f"got {len(argv) - 1}"
        )
    pack_dir = Path(argv[1])
    capability_name = argv[2]
    if not pack_dir.is_dir():
        _die(f"pack directory not found: {pack_dir}")

    kwargs = _read_stdin_kwargs()
    # Strip gateway-side internal envelope fields (_context, _agent_id, etc.).
    # The gateway's capability protocol attaches these to every dispatch; pack
    # functions follow the declared schema and don't accept them. v0.0.3
    # PackContext expansion (GH #468) will introduce structured context passing
    # for packs that opt in. See GH #474.
    kwargs = {k: v for k, v in kwargs.items() if not k.startswith("_")}
    module = _load_capabilities_module(pack_dir)
    func = _resolve_function(module, capability_name)

    try:
        result = func(**kwargs)
    except Exception as exc:
        _write_envelope(
            {
                "ok": False,
                "error": {
                    "type": type(exc).__name__,
                    "message": str(exc),
                    "traceback": traceback.format_exc(),
                },
            }
        )
        return

    if not isinstance(result, dict):
        _write_envelope(
            {
                "ok": False,
                "error": {
                    "type": "InvalidReturn",
                    "message": (
                        f"capability returned {type(result).__name__}, expected dict"
                    ),
                    "traceback": "",
                },
            }
        )
        return

    _write_envelope({"ok": True, "result": result})


if __name__ == "__main__":
    main(sys.argv)
