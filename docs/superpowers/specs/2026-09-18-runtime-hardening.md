# Runtime hardening design

Design record, 2026-09-18. This preserves the approved scope; it is not a deployment runbook. See the maintained [architecture](../../architecture.md), [deployment guide](../../deployment.md), and [implementation record](../plans/2026-09-18-runtime-hardening.md).

Approved direction: keep Bun, Elysia, SQLite, Drizzle and Loro; preserve anonymous rooms and accept an approximately 500 ms normal-operation persistence window. No new service or authentication requirement.

## Persistence and resource ownership

Document updates are imported and relayed immediately. A room's first dirty update schedules a snapshot save after 500 ms; later updates do not postpone that deadline. Leaving the last connection flushes immediately. Shutdown flushes before database close. Save failure retains dirty state, reports the error, retries on the next bounded interval and prevents eviction.

Store new snapshots as binary BLOBs. Keep the existing JSON column nullable for migration compatibility; old data includes a JSON-encoded string containing a JSON byte array. Reads support that legacy form and prefer binary data. A subsequent successful save clears legacy data. Generate the schema migration through Drizzle Kit. Never alter the existing migration. Back up databases before deployment; rollback after binary writes requires restoring the backup or converting binary rows, not only reverting code.

Reclaim empty in-memory rooms after five minutes without deleting their database rows. Bound room identifiers, inbound message bytes, concurrent clients, resident rooms and anonymous room creation frequency. Reject excess requests without mutating documents or creating persistent rooms. Limits are resource protection, not authentication or comprehensive abuse prevention.

## Frontend invalidation

Classify Loro batches by root path: file text, workspace metadata and settings. Text-only events must not rebuild the workspace tree or rerender AppShell. CodeMirror and preview still observe document changes directly. Mixed metadata/text transactions refresh workspace state. Initial snapshots refresh all required state.

Coalesce Vim search count refreshes during edits without limiting exact counts. Query changes and explicit navigation refresh immediately; dispose pending callbacks with the editor.

## Dependencies and browser verification

Replace floating latest ranges with installed compatible versions. Pin the starter's tested dependency combination; remove the runtime Rolldown rewrite only after real preview tests pass. Move shadcn to development dependencies. Keep browser E2E release/manual gating. Isolate resource-intensive WebContainer tests while retaining ordinary test parallelism.

Follow-mode decoration uses actual gutter geometry. Palette navigation tests assert the selected command instead of relying on command-order offsets.

## Structure and acceptance

Split AppShell by room/session and workspace ownership, settings by section, shared starter fixtures out of project helpers, and oversized E2E suites by workflow. Avoid new generic frameworks. Files remain under 500 lines and React components under 300 lines.

Acceptance includes legacy migration, binary roundtrip, periodic persistence under continuous edits, retry after database failures, last-leave/shutdown recovery, reconnect/eviction, malformed and oversized input rejection, text-only invalidation, long-file search, paired collaboration, preview and rendered follow/palette behavior. Update architecture and deployment documentation with failure boundaries.

Do not build, read `.env` files, or commit automatically. Static checks target changed files only. Use isolated databases for testing. Each batch must remain independently usable.
