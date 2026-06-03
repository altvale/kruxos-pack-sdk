"""{{pack_name}} — Capability implementations with Service Proxy integration.

This pack integrates an external service via the KruxOS Service Proxy framework.
It includes a SyncAdapter for local read-replica management and a WriteExecutor
for buffered write operations.
"""

from typing import Any


def {{capability_prefix}}_query(query: str, limit: int = 100) -> dict[str, Any]:
    """Query the local read-replica.

    In production, this reads from the SyncStore populated by the SyncAdapter.

    Args:
        query: Filter expression.
        limit: Maximum results.

    Returns:
        Dict with 'results', 'count', and 'synced_at'.
    """
    # TODO: Replace with actual SyncStore query
    return {
        "results": [],
        "count": 0,
        "synced_at": "2024-01-01T00:00:00Z",
    }


def {{capability_prefix}}_write(action: str, data: dict[str, Any]) -> dict[str, Any]:
    """Buffer a write operation for approval and execution.

    In production, this submits to the WriteProxy buffer.

    Args:
        action: Write action ('create', 'update', 'delete').
        data: Payload for the write.

    Returns:
        Dict with 'write_id' and 'status'.
    """
    if action not in ("create", "update", "delete"):
        raise ValueError(f"Invalid action: {action}. Must be create, update, or delete.")

    # TODO: Replace with actual WriteProxy submission
    return {
        "write_id": "placeholder-write-id",
        "status": "buffered",
    }
