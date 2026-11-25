# TypeScript intelligence

[Documentation home](../README.md#documentation) · [Architecture](architecture.md) · [Development](development.md) · [Testing](testing.md#typescript-worker-checks)

Tsugite keeps TypeScript analysis in the browser. CodeMirror, Vim, and Loro
remain the owners of editing and shared document state; the language-service
layer receives versioned data and returns serializable results.

For editor actions and dependency-type availability, start with [TypeScript assistance](getting-started.md#typescript-assistance). This guide describes the implementation contract, resource budgets, and recovery behavior.

## Runtime

`RoomTypeScriptIntelligence` owns one lazily started Worker per room session.
`EditorIntelligence` exposes asynchronous pure-data queries for hover,
completion, signature help, diagnostics, and navigation. The client validates
paths, revisions, request IDs, and cancellation before applying a reply.

```mermaid
flowchart TB
  Loro["Local and remote Loro changes"] --> Owner["RoomTypeScriptIntelligence"]
  Owner -->|source and declaration deltas| Engine["Injected EditorIntelligence"]
  Engine --> Client["TypeScriptWorkerClient"]
  Editor["CodeMirror providers"] -->|UTF-16 query positions| Engine
  Client <-->|request ID, epoch, workspace version| Worker["Worker session and runtime compiler"]
  Libs["Bundled standard libraries"] --> Worker
  Container["Installed WebContainer dependencies"] --> Scan["Bounded declaration scanner"]
  Scan --> Owner
  Client -->|retry exhausted or invalid snapshot| Disabled["Disable language services; keep base editor"]
  Client -->|workspace update| Refresh["Refresh CodeMirror diagnostics"]
```

The Worker uses `typescript-legacy` 6.0.3 with a versioned in-memory host and
explicit standard libraries. Tooling TypeScript is independent. The compiler is
loaded lazily in the Worker, so a normal editor session does not pull compiler
objects onto the main thread. Cancellation rejects late results but cannot
preempt synchronous compiler work already running in the Worker.

The language service is a separate Worker from syntax highlighting. A failed
language query or exhausted language-service retry must not disable the
Highlights fallback, editor input, Vim, or CRDT synchronization.

The room owner publishes unopened and remotely edited files as well as the
active file. File and workspace versions prevent stale epochs, revisions, and
cancelled queries from replacing current results. Parsing is deferred until a
query needs a snapshot. Diagnostics wait 200 ms after edits and refresh when
declarations or workspace snapshots change. Navigation is capped at 10,000
locations, and replies carry one source snapshot per path so repeated
references do not duplicate whole files across the RPC boundary.

## Resource limits

| Resource                                  | Limit                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Project source                            | 512 files, 1 MiB per file, 16 MiB total UTF-8 text                                |
| Project declarations and package metadata | 1,024 files, 1 MiB per declaration, 64 KiB per metadata file, 8 MiB total         |
| Declaration scan                          | 8,192 traversed entries, 16 MiB serialized output, two-second deadline            |
| Worker requests                           | Queue of 32; 15-second initialization, then two-second query and update deadlines |
| Navigation result                         | 10,000 locations; 24 MiB of unique source snapshots per reply                     |
| Worker recovery                           | One retry per room session; a valid replacement can recover a rejected snapshot   |

These are language-service budgets, not project storage or transport quotas.
The server separately limits each encoded CRDT update to 1 MiB; a project
within the Worker budget can still exceed that update limit in one large edit.
See [server resource limits](deployment.md#resource-limits).

Budget sources are [typescript-worker-protocol.ts](../apps/web/src/lib/typescript-worker-protocol.ts),
[typescript-declarations.ts](../apps/web/src/lib/typescript-declarations.ts), and
[declaration-scan-limits.ts](../apps/web/src/lib/declaration-scan-limits.ts).

The standard-library loader follows the official `lib.es2022.full.d.ts`
reference graph from bundled assets under the reserved `__typescript/`
namespace. After dependency installation, and when source imports change, the
WebContainer scanner reads only declarations and package metadata, including
package type entries and `@types` companions.

The browser import index caches references until file text changes and yields
between files after an eight-millisecond time slice. Concurrent scans cannot
restore stale import keys after newer edits or preview teardown. The scanner is
filesystem-only, bounds reads before allocation, and rejects unsafe paths and
escaping symlinks. It never evaluates arbitrary type CDNs or package code.

Reinstall clears stale declarations; loading and unavailable states are visible.
Scan failure clears project dependency types. An imported package without its
own declarations, companion types, or an ambient module marks project
declarations unavailable. This package-level check does not replace TypeScript
entry-point and subpath resolution.

An oversized or unsafe snapshot is rejected. Publishing a corrected snapshot
within the limits clears that rejection; a Worker that exhausts its single
session retry remains disabled and is not revived by a later snapshot.

## Recovery

| Symptom                                  | Behavior and next check                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency declarations loading          | Wait for the local preview installation and scan. The room shares runtime preferences, but every browser installs its own dependencies.                                                                                         |
| Dependency declarations unavailable      | Inspect Output and dependency/type packages. Scan failure clears stale dependency types; successful reinstall/scan can replace them. A package without declarations, companion types, or an ambient module remains unavailable. |
| Unsafe path or snapshot over budget      | Correct the project to fit the limits above. A valid replacement snapshot can clear this rejection without restarting the room.                                                                                                 |
| Individual query times out               | The late reply is discarded. A query timeout alone does not restart the Worker.                                                                                                                                                 |
| Worker fails during startup or messaging | The client retries once in the room session. Exhausting that retry disables language services for that session.                                                                                                                 |

After a session exhausts its Worker retry, preserve any pending edits before
reloading to create a new room session. Reinstalling dependencies does not reset
that retry budget. A language-service error alone is not a reason to discard a
local recovery draft or restart the room server.

The [testing guide](testing.md#typescript-worker-checks) separates controlled
Worker benchmarks, rendered editor/recovery checks, and real preview installation.

## Replacement gate

The engine replacement in [#71](https://github.com/BBboy01/Tsugite/issues/71)
requires an official browser-compatible TypeScript 7 API and distribution.
Keep this Worker contract stable until that gate and equivalent functional and
performance checks pass.
