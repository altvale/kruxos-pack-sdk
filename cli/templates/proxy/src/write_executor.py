"""{{pack_name}} — Write Executor for Service Proxy integration.

Implements the WriteExecutor interface to execute approved write operations
against the external service. The proxy framework calls execute_write()
after a buffered write is approved.
"""

from typing import Any


class {{class_name}}WriteExecutor:
    """Write executor for the {{pack_name}} external service.

    Translates approved write operations into actual API calls
    against the external service.
    """

    def __init__(self, credentials: dict[str, str]) -> None:
        """Initialize with service credentials from the vault.

        Args:
            credentials: Dict with keys needed to authenticate to the service.
        """
        self.credentials = credentials

    async def execute_write(self, write_op: dict[str, Any]) -> dict[str, Any]:
        """Execute an approved write operation against the external service.

        Args:
            write_op: Dict with 'action' and 'data' from the write buffer.

        Returns:
            Dict with execution result: {'success': bool, 'external_id': str | None}
        """
        action = write_op.get("action")
        data = write_op.get("data", {})

        # TODO: Implement actual write execution
        # Example for 'create':
        #   response = await self._api_client.create(data)
        #   return {"success": True, "external_id": response["id"]}

        return {"success": False, "external_id": None}

    async def validate_write(self, write_op: dict[str, Any]) -> dict[str, Any]:
        """Pre-validate a write operation before buffering.

        Called before the write is added to the buffer. Return errors
        early to give immediate feedback to the agent.

        Args:
            write_op: Dict with 'action' and 'data'.

        Returns:
            Dict with 'valid' (bool) and optional 'errors' (list of strings).
        """
        errors = []

        if write_op.get("action") not in ("create", "update", "delete"):
            errors.append(f"Invalid action: {write_op.get('action')}")

        if not write_op.get("data"):
            errors.append("Data payload must not be empty")

        return {"valid": len(errors) == 0, "errors": errors}
