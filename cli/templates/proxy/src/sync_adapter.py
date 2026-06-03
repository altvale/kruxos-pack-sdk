"""{{pack_name}} — Sync Adapter for Service Proxy integration.

Implements the SyncAdapter interface to keep a local read-replica of the
external service's data in sync. The proxy framework calls these methods
on a configured schedule.
"""

from typing import Any


class {{class_name}}SyncAdapter:
    """Sync adapter for the {{pack_name}} external service.

    Implement full_sync() and incremental_sync() to populate the local
    read-replica (SyncStore) with data from the external service.
    """

    def __init__(self, credentials: dict[str, str]) -> None:
        """Initialize with service credentials from the vault.

        Args:
            credentials: Dict with keys needed to authenticate to the service.
        """
        self.credentials = credentials

    async def full_sync(self, store: Any) -> dict[str, Any]:
        """Perform a full sync of all data from the external service.

        Called on first sync and periodically for consistency verification.

        Args:
            store: SyncStore instance for writing to the local read-replica.
                   Use store.execute_batch(sql) to upsert records.

        Returns:
            Dict with sync statistics: {'records_synced': int, 'duration_ms': int}
        """
        # TODO: Implement full sync from your external service
        # Example:
        #   data = await self._fetch_all_records()
        #   for record in data:
        #       store.execute_batch(f"INSERT OR REPLACE INTO records ...")
        return {"records_synced": 0, "duration_ms": 0}

    async def incremental_sync(self, store: Any, since: str) -> dict[str, Any]:
        """Sync only records changed since the given timestamp.

        Called on the regular sync schedule (e.g., every 5 minutes).

        Args:
            store: SyncStore instance.
            since: ISO 8601 timestamp of the last successful sync.

        Returns:
            Dict with sync statistics.
        """
        # TODO: Implement incremental sync
        return {"records_synced": 0, "duration_ms": 0}

    def schema_sql(self) -> str:
        """Return SQL to create the read-replica tables.

        Called once when the service is first registered.

        Returns:
            SQL DDL string to create tables in the SyncStore.
        """
        return """
        CREATE TABLE IF NOT EXISTS records (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
