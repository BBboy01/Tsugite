# Runtime Hardening Implementation Plan

Implementation record, 2026-09-18. The checklist and verification counts describe that implementation session, not the current release or test inventory. Operational instructions live in the maintained [architecture](../../architecture.md), [deployment](../../deployment.md), and [development](../../development.md) guides. Do not restart this completed checklist as an active task.

**Goal:** Reduce synchronous persistence and UI work while preserving collaboration, recovery and preview behavior.

**Architecture:** Keep existing service boundaries. Add binary persistence and bounded room lifecycle; classify document invalidations rather than replace the state system.

**Tech Stack:** Bun, Elysia, Drizzle 1.0.0-rc.4, SQLite, Loro, React, CodeMirror, Playwright.

**Spec:** [Runtime hardening design](../specs/2026-09-18-runtime-hardening.md)

## Global Constraints

- No build, `.env` access, automatic commits or whole-project lint/typecheck/format.
- Preserve anonymous rooms and approximately 500 ms normal-operation persistence window.
- Files below 500 lines; React components below 300 lines.
- Keep release/manual browser CI gating. Tests may run locally across the full suite.
- No new external service or credentials.

## Task 1: Binary repository and legacy migration

Files: `apps/server/src/db/{database,schema}.ts`, `apps/server/src/rooms/room-repository.ts`, new repository tests and generated Drizzle migration.

Interface: `RoomRepository(database)` consumes an injected Bun SQLite Drizzle database; `load` and `save` retain the RoomStore contract. Database creation is explicit at server startup, not an import side effect.

- [x] Add and run failing in-memory database tests for legacy double-JSON recovery, binary saves and timestamp preservation. Key assertion: `expect(sqlite.query("SELECT typeof(snapshot_blob) AS kind FROM rooms").get()).toEqual({ kind: "blob" })`.
- [x] Add nullable BLOB and make legacy snapshot nullable; generate `store_binary_room_snapshots` migration with installed Drizzle Kit.
- [x] Implement injected repository and explicit database factory; migrate an old-schema fixture through the real migration runner twice to prove preservation and idempotency.
- [x] Run `bun --no-env-file test apps/server/src/rooms/room-repository.test.ts` and changed-file static checks.

## Task 2: Periodic persistence and room lifecycle

Files: `room-service.ts`, new `room-persistence.ts`, focused lifecycle tests, `index.ts` startup/shutdown.

Interface: RoomService owns room timers; `flushAll(): boolean` exposes a shutdown barrier. Store failures retain dirty rooms. Delay is 500 ms, idle TTL five minutes; tests use short injected durations and real timers.

- [x] Add failing tests asserting immediate binary relay and unchanged saved snapshot before the timer, eventual merged state under continuous edits, last-leave flush, retry and no eviction on failed save.
- [x] Implement fixed-deadline scheduling, retry and last-leave flush; cancel idle eviction on reconnect.
- [x] Add shutdown recovery test: mutate, invoke shutdown barrier, open another service using the same store, assert the final document.
- [x] Wire process signals to stop accepting traffic, flush all dirty rooms, then close database; failures must be visible and never reported as successful persistence.
- [x] Run service and repository tests together, followed by focused lint/typecheck.

## Task 3: Input and admission bounds

Files: `room-schemas.ts`, new admission helper/tests, `room-service.ts`, server route module/tests.

- [x] Add rejected-ID, oversized binary, room-capacity, connection-capacity and creation-rate tests; assert no new room/document is created on rejection.
- [x] Enforce identifier and binary limits before CRDT import, configure WebSocket payload limits, bound global and per-connection admission state.
- [x] Test limits recover after disconnect, eviction and rate-window expiry; retain anonymous joins and existing room reconnects.

## Task 4: Document invalidation and editor search

Files: RoomClient and tests, AppShell, extracted session/workspace hooks, Vim search implementation and tests.

- [x] Add real Loro event tests: text-only update produces no workspace invalidation; rename/create/delete and mixed transactions do; initial snapshot refreshes workspace/settings.
- [x] Replace broad document revision in AppShell with typed structural/settings notifications; retain editor and preview subscriptions.
- [x] Extract session and file-operation ownership from AppShell without changing public UI behavior.
- [x] Add continuous-edit search regression, then coalesce recounts with immediate query/navigation refresh and timer cleanup.
- [x] Run focused unit tests plus collaboration and Vim Playwright regressions.

## Task 5: Dependency determinism and browser regressions

Files: package.json, bun.lock, shared starter fixture, WebContainer file transform/tests, following outline, palette E2E, Playwright configuration.

- [x] Resolve installed versions from lockfile; replace latest ranges and move shadcn to devDependencies. Freeze installation to verify lock consistency.
- [x] Pin starter manifest to a tested compatible combination. Verify actual preview startup and manifest transformation tests; retain the runtime Rolldown override for legacy rooms that still require it.
- [x] Reproduce gutter overlap with multiple line-number widths; derive outline position from rendered gutter geometry and verify screenshots.
- [x] Replace palette hardcoded navigation offsets with selected-command assertions; isolate WebContainer E2E resource ownership.
- [x] Run complete unit suite and complete browser suite, report failures separately from tool/environment limitations.

## Task 6: Structure, docs and final audit

Files: settings-popover and extracted sections, project.ts and extracted starter, room.spec.ts and workflow-specific specs, docs/architecture.md and docs/deployment.md.

- [x] Split oversized modules by existing responsibility, maintaining interfaces; verify settings keyboard navigation/search and shared project tests.
- [x] Document persistence flow, invalidation ownership, operational limits, backups and rollback boundaries with valid architecture diagrams.
- [x] Check changed file sizes, diff integrity, scoped lint/format/typecheck and all unit/browser regression results.
- [x] Audit every requirement against observed results; leave any incomplete item explicitly unchecked. Do not commit or publish without a new user request.

## Verification notes

- Real WebContainer output confirmed the pinned starter installs React 19.3.0, Vite 8.3.0 and Rolldown WASM 1.2.8 and renders the interactive React counter. The legacy runtime override remains necessary for existing rooms whose manifests still select Rolldown 1.2.9; pinned new rooms already carry explicit overrides and bypass that transformation. Removing legacy compatibility has not been approved by evidence.
- A preview failure showed active dependency downloads being terminated by the old 45-second installation deadline. The deadline is now two minutes and reports `install-failed`; a failing-then-passing test verifies timeout cleanup, and another verifies that preview startup waits for installation completion.
- Frozen installation passed. A separate production installation excluded shadcn and Vite while retaining Elysia and Drizzle. Comparing lockfile package-version sets found no added or removed versions; changes include dependency hoisting.
- Mermaid parsed and rendered all three architecture diagrams. Following screenshots cover 1440x960 and 390x844, four-digit line numbers and the maximum font size.
- Two complete browser runs passed all 87 tests, including six real WebContainer rendering and recovery scenarios; the second run included the transport acknowledgement fix. After adding the oversized-edit guard, the final UI rerun passed all 82 tests. The six preview scenarios were not rerun after that guard-only change.
- Final review reproduced a rate-limit regression: 150 offline edits yielded only 119 server edits while the client reported live. Online and offline updates now share a bounded outbox with coalesced presence; server acceptance acknowledgements retain unconfirmed updates for replay after reconnect. Real-WebSocket regressions cover offline catch-up, online edit/presence bursts, lost acknowledgements, and subsequent edits. Frontend/backend deployment together is explicitly accepted; acknowledgements do not extend the normal persistence deadline or imply durable storage.
- An oversized local update now stops synchronization with an explicit offline error, retains local content, and disables futile reconnect attempts. The real-WebSocket regression passes, and a browser regression pastes 17,000 lines through the clipboard shortcut and checks the rendered error and retained content. Chromium's direct `insertText` automation path timed out for a megabyte-scale payload; the clipboard regression passed without increasing that timeout. This is not a claim that all oversized native text-input paths are performant.
- A real child-process test holds a SQLite write lock during shutdown. Disabling SQLite's per-attempt busy wait keeps shutdown within its retry deadline and produces a nonzero exit when data cannot be saved. Normal SIGTERM and SIGINT preserve the final snapshot. The final complete unit suite passed 153 tests with 426 assertions across 40 files.
- An instrumented browser probe observed zero additional AppShell renders during continuous text input. Scoped TypeScript and lint checks passed; formatting passed on 61 changed source/config/doc files, excluding the generator-owned Drizzle snapshot. All 56 changed source files remain below 500 lines and React component files below 300 lines. Diff integrity passed. No build, production database migration, commit, push or release was performed.
