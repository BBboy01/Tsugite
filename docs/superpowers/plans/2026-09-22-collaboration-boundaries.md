# Collaboration Boundaries Implementation Plan

> Status: implemented in the current working tree. The checklist below records
> the original execution sequence; the verification commands remain useful for
> future changes to these boundaries.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the collaboration transport, document, presence, and draft-recovery contracts while preserving the current wire protocol and user-visible behavior.

**Architecture:** Keep `RoomClient` as the single session facade while moving transport, document, and presence responsibilities behind narrow internal boundaries. Make `RoomDrafts` depend on a draft-specific port rather than concrete client internals.

**Tech Stack:** TypeScript, Bun test, React hooks, `loro-crdt`, existing `RoomOutbox`, existing shared JSON protocol types.

**Spec:** `docs/superpowers/specs/2026-09-22-workspace-architecture-refactor-design.md`

## Global Constraints

- Preserve the current Loro synchronization protocol, server acknowledgement behavior, offline draft recovery, keyboard mappings, and follow mode.
- Do not change the server message format or deployment compatibility contract; frontend and backend continue to deploy at the same version.
- Jotai may be used only for scoped workspace UI state; do not place Loro
  documents, presence, transport status, or draft persistence in atoms.
- Do not change persistence schema or the `RoomOutbox` rate-limit semantics.
- Local verification is limited to modified files; do not run a local build.
- Acknowledgement state must remain distinct from local persistence success.

## File Map

- Create `apps/web/src/lib/room-transport.ts`: transport socket type, connection lifecycle, reconnect scheduling, and transport callbacks.
- Create `apps/web/src/lib/room-document.ts`: Loro document, update classification, snapshot/import validation, and acknowledgement-facing update port.
- Create `apps/web/src/lib/room-presence.ts`: identity persistence, presence member merging, local presence state, and presence operations.
- Create `apps/web/src/lib/room-events.ts`: shared session event contract without implementation coupling.
- Create `apps/web/src/lib/draft-sync-port.ts`: the minimal contract required by `RoomDrafts`.
- Modify `apps/web/src/lib/room-client.ts`: retain the public session facade and delegate implementation details to the extracted boundaries.
- Modify `apps/web/src/lib/room-drafts.ts`: consume `DraftSyncPort` and remove direct dependency on `RoomClient` internals.
- Modify `apps/web/src/lib/use-room-drafts.ts`: type the hook against the draft port/session facade without changing lifecycle behavior.
- Create `apps/web/src/lib/room-transport.test.ts`: transport lifecycle and reconnect tests extracted from client coverage.
- Create `apps/web/src/lib/room-document.test.ts`: document update classification, snapshot validation, and oversized update tests.
- Keep `apps/web/src/lib/room-client.test.ts`: session composition, acknowledgement, presence, and compatibility event tests.
- Modify `apps/web/src/lib/room-drafts.test.ts`: use a small fake `DraftSyncPort` for draft-only cases and keep one adapter integration test.
- Modify `apps/web/src/lib/room-client.test.ts`: retain compatibility tests for the public `RoomClient` behavior.

## Interfaces

The following interfaces are the original design sketches for this refactor.
They are retained as historical context, not as a second source of truth. The
implemented boundaries are documented in `docs/architecture.md` and the source
types. In particular, `RoomOutbox` remains owned by `RoomClient`; the document
boundary does not own acknowledgement or retry state.

```ts
export type RoomTransportStatus = "connecting" | "live" | "reconnecting" | "offline";

export interface RoomTransport {
  readonly status: RoomTransportStatus;
  connect(): void;
  disconnect(): void;
  send(data: string | Uint8Array): boolean;
  subscribe(listener: (event: TransportEvent) => void): () => void;
}

export interface RoomDocumentPort {
  readonly doc: LoroDoc;
  readonly hasReceivedSnapshot: boolean;
  readonly pendingUpdates: readonly Uint8Array[];
  readonly hasPendingChanges: boolean;
  importRemote(data: Uint8Array): void;
  restorePendingDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): void;
  containsDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): boolean;
  acknowledge(): void;
  subscribe(listener: (event: DocumentEvent) => void): () => void;
}

export interface PresencePort {
  readonly identity: RoomIdentity;
  readonly members: readonly PresenceMember[];
  send(selectedPath?: string, cursor?: Cursor | null): void;
  updateDisplayName(value: string): boolean;
  updateColor(value: string): boolean;
  subscribe(listener: (members: readonly PresenceMember[]) => void): () => void;
}

export interface DraftSyncPort {
  readonly draftScope: string;
  readonly doc: LoroDoc;
  readonly hasPendingChanges: boolean;
  readonly pendingUpdates: readonly Uint8Array[];
  restorePendingDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): void;
  containsDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): boolean;
  subscribe(listener: (event: { type: "outbox" | "snapshot" }) => void): () => void;
}
```

`RoomClient` exposes the stable room operations needed by the workspace and
implements `DraftSyncPort`. `RoomDrafts` depends on that port, so recovery code
does not depend on transport or document internals.

## Task 1: Define transport events and move socket lifecycle

**Files:**

- Create: `apps/web/src/lib/room-transport.ts`
- Create: `apps/web/src/lib/room-transport.test.ts`
- Modify: `apps/web/src/lib/room-client.ts`

**Interfaces:**

- Consumes: current `RoomSocket`, `RoomClientOptions`, `RoomOutbox`, and shared `JoinMessage` encoding.
- Produces: `RoomTransport` and `TransportEvent` used by `RoomClient`.

- [ ] **Step 1: Write failing lifecycle tests**

Add tests for connecting, opening, socket error, socket close, reconnect delay,
manual disconnect cancelling reconnect, and stale callbacks from an old socket.
Use the existing fake socket shape from `room-client.test.ts`; assert emitted
status transitions and that a closed socket cannot mutate the current transport.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
bun test apps/web/src/lib/room-transport.test.ts
```

Expected: FAIL because the transport module and event surface do not exist.

- [ ] **Step 3: Implement the transport**

Move only socket creation, status transitions, reconnect timer ownership, and
raw send behavior into `room-transport.ts`. Keep message decoding and document
application out of this module. Expose a `send` result of `false` when the
socket is not open; do not throw on normal disconnect.

- [ ] **Step 4: Run focused tests**

Run the same command and expect all transport tests to pass.

- [ ] **Step 5: Add the compatibility adapter call path**

Change `RoomClient` to construct/use the transport while preserving its public
`connect`, `disconnect`, `status`, and event behavior. Keep protocol message
encoding in the existing client/session path until Task 2.

- [ ] **Step 6: Run compatibility tests**

```bash
bun test apps/web/src/lib/room-transport.test.ts apps/web/src/lib/room-client.test.ts
```

Expected: PASS with no changed server messages.

## Task 2: Isolate the Loro document and update acknowledgement

**Files:**

- Create: `apps/web/src/lib/room-document.ts`
- Create: `apps/web/src/lib/room-document.test.ts`
- Modify: `apps/web/src/lib/room-client.ts`

**Interfaces:**

- Consumes: transport binary-message callbacks and the existing `RoomOutbox`.
- Produces: `RoomDocumentPort`, document change events, and explicit snapshot/
  pending-update operations.

- [ ] **Step 1: Write document behavior tests**

Cover workspace/settings/content change classification, remote snapshot import,
local update enqueueing, oversized local updates, draft validation before
mutation, and acknowledgement clearing exactly one in-flight update.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
bun test apps/web/src/lib/room-document.test.ts
```

Expected: FAIL because the new document module is not implemented.

- [ ] **Step 3: Implement the document port**

Move `LoroDoc`, document subscriptions, update size checks, snapshot import,
`restorePendingDraft`, `containsDraft`, and outbox update access behind the new
class. Document listeners emit typed events for `snapshot`, `outbox`, `sync`,
and classified `document` changes. The module must validate a complete draft in
a temporary `LoroDoc` before mutating the live document.

- [ ] **Step 4: Run document tests and the existing pending-change suite**

```bash
bun test apps/web/src/lib/room-document.test.ts apps/web/src/lib/room-pending-changes.test.ts
```

Expected: PASS, including rate-limit and acknowledgement behavior.

- [ ] **Step 5: Wire the document into the compatibility facade**

Delegate `doc`, `pendingUpdates`, `hasPendingChanges`, `syncError`,
`hasReceivedSnapshot`, draft methods, and document events from `RoomClient` to
the document module. Do not expose a second mutable Loro document.

- [ ] **Step 6: Run room compatibility tests**

```bash
bun test apps/web/src/lib/room-client.test.ts apps/web/src/lib/room-drafts.test.ts
```

Expected: PASS with existing snapshots and drafts behaving identically.

## Task 3: Extract presence and identity ownership

**Files:**

- Create: `apps/web/src/lib/room-presence.ts`
- Create: `apps/web/src/lib/room-presence.test.ts`
- Modify: `apps/web/src/lib/room-client.ts`

**Interfaces:**

- Consumes: decoded presence messages and a transport send callback.
- Produces: `PresencePort`, identity persistence helpers, and merged member
  updates preserving partial cursor data.

- [ ] **Step 1: Move existing presence assertions into focused tests**

Cover identity fallback and persistence, display-name/color validation, partial
presence-list merging, explicit cursor clearing, current-user updates, and
presence queued before socket open.

- [ ] **Step 2: Implement `PresencePort`**

Move only identity and member state into the presence module. Keep protocol
decoding in the session adapter and pass typed messages into the presence store.
The store must not know about WebSocket objects.

- [ ] **Step 3: Wire the presence port and run focused tests**

```bash
bun test apps/web/src/lib/room-presence.test.ts apps/web/src/lib/presence.test.ts apps/web/src/lib/remote-presence.test.ts
```

Expected: PASS, including existing collaborator badge and follow-mode data.

- [ ] **Step 4: Run the compatibility suite**

```bash
bun test apps/web/src/lib/room-client.test.ts apps/web/src/lib/room-pending-changes.test.ts
```

Expected: PASS with unchanged presence messages and member ordering.

## Task 4: Keep the session facade and remove draft internals coupling

**Files:**

- Create: `apps/web/src/lib/room-events.ts`
- Create: `apps/web/src/lib/draft-sync-port.ts`
- Modify: `apps/web/src/lib/room-drafts.ts`
- Modify: `apps/web/src/lib/use-room-drafts.ts`
- Modify: `apps/web/src/lib/room-client.ts`
- Modify: `apps/web/src/lib/room-drafts.test.ts`

**Interfaces:**

- Consumes: `RoomTransport`, `RoomDocument`, `RoomPresence`.
- Produces: one stable `RoomClient` event stream and a `DraftSyncPort` for
  recovery code.

- [ ] **Step 1: Add a fake `DraftSyncPort` and draft contract tests**

Replace direct `RoomClient` typing in the draft unit tests with a fake port that
contains only `draftScope`, `doc`, pending state, restore, contains, and the
`outbox`/`snapshot` subscription. Keep one integration test using `RoomClient`
to prove the adapter contract.

- [ ] **Step 2: Run the draft tests and verify the type boundary fails**

```bash
bun test apps/web/src/lib/room-drafts.test.ts
```

Expected: the test should fail to type-check until `DraftSyncPort` is declared
and `RoomDrafts` accepts it.

- [ ] **Step 3: Change `RoomDrafts` to consume `DraftSyncPort`**

Update the constructor and event subscription to use the narrow interface. Keep
all checkpoint timing, locking, pruning, idempotent restore, and error state
semantics unchanged.

- [x] **Step 4: Keep `RoomClient` as the session facade**

Compose the three ports, decode incoming JSON/binary messages in one place,
route binary data to the document, route presence messages to the presence
store, and translate port events into the existing `RoomClientEvent` union.
Keep `RoomClient` as the consumer API while its internals delegate to the
transport, document, presence, and outbox boundaries.

- [x] **Step 5: Keep the public compatibility surface stable**

Preserve all current public getters and methods. The facade must not duplicate
document, presence, or reconnect state. Its `subscribe` implementation emits
the shared `RoomClientEvent` contract.

- [ ] **Step 6: Run all collaboration tests**

```bash
bun test apps/web/src/lib/room-transport.test.ts apps/web/src/lib/room-document.test.ts apps/web/src/lib/room-presence.test.ts apps/web/src/lib/room-client.test.ts apps/web/src/lib/room-pending-changes.test.ts apps/web/src/lib/room-drafts.test.ts
```

Expected: PASS with no changes to server fixtures or protocol payloads.

## Task 5: Consumer migration and verification

**Files:**

- Modify: `apps/web/src/app-shell.tsx`
- Modify: `apps/web/src/lib/use-room-drafts.ts`
- Modify: any consumer found by `rg -n "RoomClient|\.doc|pendingUpdates|containsDraft|restorePendingDraft" apps/web/src --glob '*.ts' --glob '*.tsx'`

**Interfaces:**

- Consumes: `RoomClient` and `DraftSyncPort`.
- Produces: no direct consumer dependency on transport, document, or presence
  internals.

- [ ] **Step 1: Enumerate direct internal consumers**

Run the `rg` command above and classify each reference as public facade use,
document use, presence use, or draft recovery use. Do not migrate unrelated
test fixtures without preserving their coverage purpose.

- [ ] **Step 2: Migrate runtime consumers**

Use `RoomClient` through `useRoomSession` and pass `DraftSyncPort` to
`useRoomDrafts`.

- [ ] **Step 3: Run changed-file static checks**

```bash
bunx --no-install oxlint <modified .ts/.tsx files>
bunx --no-install oxfmt --check <modified files>
bunx --no-install tsc --noEmit
git diff --check
```

Expected: all checks pass; no build is run locally.

- [ ] **Step 4: Run the collaboration regression suite**

```bash
bun test apps/web/src/lib/room-transport.test.ts apps/web/src/lib/room-document.test.ts apps/web/src/lib/room-presence.test.ts apps/web/src/lib/room-client.test.ts apps/web/src/lib/room-pending-changes.test.ts apps/web/src/lib/room-drafts.test.ts
```

Expected: PASS, including reconnect, server acknowledgement, oversized draft,
offline recovery, presence, and active-file collaboration behavior.

- [ ] **Step 5: Verify the migration boundary**

Run:

```bash
rg -n "new CustomEvent|RoomClient|pendingUpdates|containsDraft|restorePendingDraft" apps/web/src --glob '*.ts' --glob '*.tsx'
```

Confirm that no new global event or direct internal access was introduced and
that the remaining `RoomClient` references are intentional facade/test usage.

## Completion Evidence

The phase is complete only when the focused suites pass, changed-file lint,
format, typecheck, and diff checks pass, the migration-boundary search is
reviewed, and a desktop smoke test confirms the room still loads, edits sync,
presence badges update, and draft recovery remains available. The phase must
not be marked complete solely because TypeScript compiles.
