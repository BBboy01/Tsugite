# Workspace Architecture Refactor Design

## Status

Implemented for collaboration, workspace-state, editor lifecycle, semantic theme
tokens, and measured file-tree virtualization boundaries. Broader visual and performance-hardening
items remain follow-up work and should be backed by measurements before adding
further memoization or deferred updates. The file-tree benchmark records startup
cost and verifies bounded rendered rows for a 5,000-file snapshot. This document
does not change the wire protocol, persistence schema, or user-facing command
semantics by itself.

Theme palettes and derived semantic roles now live in separate stylesheets.
The extraction preserves the existing palette values, muted-text formulas,
surface opacity, and focus strengths. Browser characterization covers nested
theme boundaries, portal dialogs, and temporary theme previews.

The editor benchmark now covers 500 and 10,000 lines of TypeScript, records
workspace-subtree commit costs and CPU profiles, and checks desktop/narrow
scroll containment. Shiki tokenization now runs in a bounded dedicated-worker
queue, returning viewport spans and discarding superseded results. TypeScript
updates now publish text versions without eager parsing; the language service
analyzes current snapshots on demand. Preview preflight disables unused code
generation and parses only after the existing preview debounce. First-definition
command latency is recorded separately from continuous typing. Passing DOM and interaction
assertions does not mean that performance work is complete.

## Goals

- Give collaboration, draft recovery, and workspace UI state explicit ownership
  boundaries.
- Preserve the current Loro synchronization protocol, server acknowledgement
  behavior, offline draft recovery, keyboard mappings, and follow mode.
- Reduce the amount of coordination that currently lives in `AppShell`,
  `useWorkspaceController`, and `RoomClient`.
- Replace ad-hoc cross-component browser events with typed commands and state
  transitions where the feature boundary is local to the application.
- Make reconnection, draft recovery, focus transitions, and modal closing
  independently testable.
- Keep the refactor incremental so every phase can ship with behavior-preserving
  tests and a reversible migration path.

## Non-goals

- Jotai is allowed only as a scoped UI-state store under each `AppShell`;
  collaboration documents, presence, transport status, and draft persistence
  remain owned by `RoomClient` and its ports.
- No change to the server message format or deployment compatibility contract;
  frontend and backend continue to deploy at the same version.
- No replacement of Loro, CodeMirror, WebContainer, Drizzle, or the existing
  component library.
- No broad visual redesign before the state and ownership boundaries are stable.

## Current pressure points

`RoomClient` currently combines WebSocket transport, reconnect scheduling,
Loro document lifecycle, presence, identity storage, and pending update state.
`RoomDrafts` therefore depends on a concrete client instead of a narrow draft
recovery contract. On the UI side, `AppShell` and
`useWorkspaceController` coordinate room state, file navigation, editor tabs,
preview panels, keymaps, follow mode, mobile panels, dialogs, and focus. Several
features communicate through global `CustomEvent` names, which makes ownership
and lifecycle behavior difficult to test.

## Proposed architecture

The public surface remains a small compatibility facade during migration, while
the implementation is divided into four boundaries:

### Collaboration boundary

- `RoomTransport` owns WebSocket creation, raw frame delivery, reconnect/backoff,
  connection status, and transport errors.
- `RoomDocument` owns the Loro document, snapshot application, local update
  observation, and draft validation. `RoomClient` routes acknowledgements to
  `RoomOutbox`, which owns pending updates and replay.
- `RoomPresence` owns local identity, remote members, active file metadata,
  cursors, and follow-target updates.
- `RoomClient` composes the three pieces and acts as the session facade for the
  workspace: document snapshots, local edits, presence, connection status, and
  recovery signals. The `useRoomSession` hook owns its React lifecycle.

The existing `RoomClient` remains the public session facade while its internals
delegate to the new boundaries, so migration does not require a flag day or
duplicate protocol behavior.

### Draft recovery boundary

`RoomDrafts` depends on a `DraftSyncPort` containing only the operations it
needs: current draft scope, snapshot/update validation, draft containment, and
pending-update restoration. It must not reach into transport or document
internals. Recovery remains idempotent and keeps the current distinction between
local persistence, server acknowledgement, and retryable transport failure.

### Workspace state boundary

The typed `WorkspaceState` and `WorkspaceCommand` model uses a scoped Jotai
store for UI state shared across features:

- active file and open editor tabs;
- the local follow target;
- mobile panel and preview console visibility;
- the active workspace dialog: settings, command palette, or file search.

State needed by only one feature stays with that feature. File-tree inline
editing and delete confirmation, search input and result selection, settings
navigation, and temporary theme preview do not enter the workspace store.
Local preferences retain their browser-storage adapters. Editor focus refs,
Vim motion timers, and projected collaborator cursors remain owned by their
existing hooks or editor integration, rather than being duplicated in atoms.

Commands are synchronous descriptions of user intent. Effects that touch the
room or runtime are handled by explicit controller functions, not by atoms.
The reducer remains framework-neutral and is used by the command atom, allowing
unit tests to exercise transitions without rendering React. A `Provider` is
mounted per `AppShell` so multiple rooms cannot share selection or dialog state.

### UI composition boundary

`AppShell` becomes a composition root: it creates the session and workspace
controller, subscribes to state, and renders feature components. Feature
components receive narrow props or command callbacks. Existing global events are
adapted at the boundary and removed one event family at a time; runtime actions
that genuinely cross an independent subsystem may keep a typed event adapter.

## Data flow

```text
WebSocket
   |
RoomTransport -- status/errors --> RoomClient
   |                                  |
   |                             RoomDocument
   |                                  |
   +---------------------------> DraftSyncPort
                                      |
                                  RoomDrafts

RoomClient + WorkspaceController
              |
       WorkspaceState
              |
     AppShell and feature UI
              |
       WorkspaceCommand
```

Local text edits flow directly from CodeMirror's Loro integration into the
session's document boundary and transport outbox; they do not pass through
Jotai or workspace commands. Remote document events are classified by changed
root containers so text edits do not rebuild workspace metadata. Workspace
commands represent local UI transitions only. Draft flush and acknowledgement
state remain observable separately, so a connection loss cannot be mistaken for
a durable save.

## Migration phases

### Phase 1: collaboration reliability

1. Define transport, document, presence, and draft ports around existing
   behavior.
2. Move implementation behind those ports without changing message ordering,
   retry limits, acknowledgement handling, or snapshot semantics.
3. Make `RoomDrafts` consume the narrow port and add tests for reconnect,
   acknowledgement, oversized drafts, duplicate recovery, and offline replay.
4. Keep `RoomClient` as the compatibility adapter and remove direct internal
   access from consumers.

### Phase 2: workspace state and interaction

1. Extract a framework-neutral workspace state model and command dispatcher.
2. Move file/editor/preview/settings/keymap/follow transitions into the model or
   explicit effects while preserving existing shortcut behavior.
3. Adapt CustomEvent callers to typed commands, then delete redundant event
   names after all consumers migrate.
4. Reduce `AppShell` and `useWorkspaceController` to composition and lifecycle
   wiring; keep UI components focused on rendering and DOM interaction.

### Phase 3: visual and performance hardening

1. Consolidate repeated colors, focus rings, muted text, and surface styles into
   existing CSS variables/tokens without changing theme semantics.
2. Measure render frequency and long-file/file-tree costs before introducing
   further memoization, deferred updates, or virtualization. File-tree
   virtualization is implemented and covered by a 5,000-file browser benchmark.
3. Keep editor interaction and collaborative cursor updates responsive while
   avoiding unnecessary whole-shell renders.
4. Run desktop and mobile Playwright checks for focus order, keyboard navigation,
   scrolling containment, modal dismissal, command palette/file search, and
   follow-mode visual indication.

## Error handling and compatibility

- Transport failures are represented as typed session status and never silently
  converted into a successful draft save.
- Document decode/apply failures are isolated from UI rendering; the session
  reports a recoverable error and preserves the last valid local state.
- Draft recovery remains safe to retry and never sends the same acknowledged
  update twice.
- The workspace command atom validates command names and payload types before
  calling the pure reducer. Invalid commands leave state unchanged and emit a
  payload-free development-time diagnostic rather than crashing the workspace.
- Existing keyboard shortcuts and URL/deep-link behavior remain compatibility
  requirements throughout migration.

## Testing strategy

- Unit tests for each new port and pure workspace transition, including repeated
  events; atom-boundary tests reject invalid command payloads without notifying
  subscribers and allow subsequent valid commands to proceed.
- Existing `room-client` and `room-drafts` suites remain as compatibility tests
  until adapters are removed.
- Focused React tests for modal focus return, command palette/file-search
  navigation, settings search, and follow-mode cursor projection.
- Playwright UI regression for desktop and mobile layouts, long editor content,
  scroll containment, and collaboration indicators.
- Changed-file-only lint, formatting, and TypeScript checks locally; the normal
  CI build and integration checks remain the final gate.

## Rollout and rollback

Each phase should be delivered as independently reviewable changes. The first
phase must be behavior-preserving and can be rolled back by restoring the
`RoomClient` adapter implementation. The second phase keeps the old event
adapters until the new command path is covered. The third phase is limited to
measured UI/performance changes and can be reverted without affecting persisted
room data or the wire protocol.

## Acceptance criteria

- Collaboration reconnect, acknowledgement, offline draft recovery, and active
  presence behavior pass their existing and new focused tests.
- `AppShell` and `useWorkspaceController` no longer own unrelated transport or
  feature-specific transition logic.
- New feature code communicates through typed ports/commands instead of adding
  new string-based global events.
- Existing user-visible shortcuts, file navigation, settings, preview, follow
  mode, and modal focus behavior remain intact.
- Long documents do not make the page itself scroll, and the editor remains the
  scroll owner.
- Desktop and mobile Playwright smoke checks pass, and performance changes are
  supported by measurements rather than assumptions.
