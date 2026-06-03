"""{{pack_name}} — Capability implementations.

Each function implements one capability defined in definitions/*.yaml.
The function name must match the capability name (dots replaced with underscores).
"""

from typing import Any


def {{capability_prefix}}_example(input_value: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute the example capability.

    Args:
        input_value: The primary input value.
        options: Optional configuration.

    Returns:
        Dict with 'result' and 'metadata' keys matching the definition outputs.
    """
    if not input_value:
        raise ValueError("input_value must not be empty")

    return {
        "result": f"Processed: {input_value}",
        "metadata": {
            "pack": "{{pack_name}}",
            "options_provided": options is not None,
        },
    }
