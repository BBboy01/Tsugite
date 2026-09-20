# Offline Draft Recovery Implementation Plan

**Goal:** Preserve unacknowledged room edits across reloads and offer explicit restore or discard.

**Architecture:** IndexedDB stores versioned binary Loro snapshots and the unacknowledged update queue. Each client session owns a unique record under an exclusive Web Lock. Reopening a room offers only unowned records for that server/room; restoring merges CRDT history and replays pending updates through the existing rate-limited outbox. No server protocol or persistence changes.

**Tech Stack:** Existing React, Radix Dialog, Loro, native IndexedDB and Web Locks. No new dependencies.

## Constraints

- Preserve current uncommitted UX fixes; do not commit, push, build, or access environment files.
- Never import or transmit a saved draft before explicit restore.
- Keep the source draft until the recovered pending queue is saved or acknowledged.
- Discard removes only the explicitly selected local draft, never server data.
- Use transaction completion as the saved signal. Storage failure must remain visible and retain the unload guard.
- Coalesce checkpoints over 250 ms with a fixed first-write deadline. Browser termination before checkpoint completion and browser storage eviction remain limitations.
- Active tabs must not overwrite or claim one another's drafts. Unsupported storage/locking degrades visibly, without blocking editing.
- Validate saved records and CRDT bytes before mutating the live document. Oversized updates remain local, as in the existing protocol.

## Tasks

- [x] Add failing unit tests for opt-in recovery, acknowledgement cleanup, merge with remote changes, discard, room/active-tab isolation, failed storage and invalid data.
- [x] Implement `room-draft-store.ts` (IndexedDB/locks), `room-drafts.ts` (checkpoint and recovery lifecycle), and the minimal RoomClient/outbox hooks.
- [x] Add `use-room-drafts.ts`, `room-draft-recovery.tsx`, and localized recovery/status labels. Verify restore/discard via real browser reload and multiple pages.
- [x] Update architecture and recovery documentation, run changed-file lint/format/typecheck, unit tests, targeted browser regressions and desktop/mobile screenshots.

## Verification

```sh
bun test apps/web/src/lib/room-drafts.test.ts
bun test apps packages
bunx --no-install playwright test e2e/offline-drafts.spec.ts e2e/pending-changes.spec.ts e2e/follow-tab-close.spec.ts
```

Use scoped compiler roots for changed TS files. Do not claim browser-wide durability or server disk persistence from local save/ACK events.

Verified: 179 unit tests (523 assertions), 115 UI regression tests, and a final six-test offline-draft browser run including failed-backup retry. Changed-file lint, format, scoped TypeScript and diff checks passed. Chromium visual checks at 1440x900 and 390x844 confirmed recovery layout, focus trapping and editor focus restoration. Browser storage eviction, unfinished checkpoints and the existing server persistence window remain documented limitations. No build, commit, push or deployment was performed.
