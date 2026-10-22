# Development guide

[Documentation home](../README.md#documentation) · [Architecture](architecture.md) · [Contributing](../CONTRIBUTING.md)

## Repository layout

```text
apps/web/       React application, editor, settings, preview, and browser state
apps/server/    Elysia WebSocket server, room service, and SQLite persistence
packages/shared Shared project model, settings, protocol, and CRDT helpers
drizzle/        Checked-in Drizzle migrations and snapshots
e2e/            Playwright browser workflows
.github/        CI, release, image publishing, and dependency automation
docs/           User, development, deployment, and architecture documentation
```

Start with the [documentation index](../README.md#documentation). Keep user workflows in the getting-started guide, operational procedures in the deployment guide, runtime ownership or data-flow decisions in the architecture guide, and Worker limits in the [TypeScript intelligence guide](typescript-intelligence.md).

The browser owns editor state, preferences, and WebContainer execution. Unacknowledged edits remain in the in-memory outbox and are checkpointed to IndexedDB for explicit draft recovery. Local backup requires IndexedDB and Web Locks; storage eviction or an unfinished checkpoint can still lose edits. A local checkpoint and a server acknowledgement are separate from SQLite persistence. See [local draft recovery](architecture.md#local-draft-recovery). The server owns room membership, presence relay, the in-memory Loro document, and SQLite snapshots. Shared types and transformations belong in `packages/shared`.

## Local workflow

Use the Bun version in [`.bun-version`](../.bun-version) and install from the lockfile with `bun install --frozen-lockfile`. Start the server and web app in separate terminals, from the repository root:

```bash
bun run dev:server
```

```bash
bun run dev:web
```

The default ports are `3001` for the server and `5173` for Vite. Vite can select another port if its default is occupied; the backend address does not change automatically. To use a separate backend:

```bash
PORT=3002 DATABASE_PATH=:memory: bun --no-env-file apps/server/src/index.ts
```

In the web terminal:

```bash
VITE_WS_URL=ws://127.0.0.1:3002/ws bun run dev:web --host 127.0.0.1 --port 5174 --strictPort
```

The client appends the room ID to `VITE_WS_URL`. `:memory:` is useful for disposable backend checks and loses all room data when the process exits. Production configuration is covered in [deployment](deployment.md#configuration).

## Database migrations

Edit [the schema](../apps/server/src/db/schema.ts), generate a named migration, and review its SQL and snapshot together:

```bash
bun --no-env-file run db:generate --name=describe_the_change
bun --no-env-file x --no-install drizzle-kit check
```

Commit the complete generated directory under `drizzle/`, including its schema snapshot. The timestamp prefix records ordering; the descriptive suffix explains the change. Do not ignore migrations or rewrite ones that have already shipped. Runtime files in `data/` and SQLite journal files are ignored by Git.

The server applies pending migrations on startup. `bun run db:migrate` applies them explicitly to `DATABASE_PATH` or the default `./data/tsugite.sqlite`. Test against a disposable database before changing real data:

```bash
migration_dir="$(mktemp -d)"
DATABASE_PATH="$migration_dir/rooms.sqlite" bun --no-env-file run db:migrate
```

This leaves the temporary database available for inspection. The repository tests also cover legacy JSON snapshots, binary roundtrips, and migration idempotency. Read the [backup and rollback requirements](deployment.md#persistence-and-upgrades) before deploying a storage change.

## Verification

Use focused tests and static checks while iterating:

```bash
bun --no-env-file test apps/server/src/room-reconnect.test.ts
bun --no-env-file x --no-install oxlint apps/web/src/lib/room-client.ts
bun --no-env-file x --no-install oxfmt --check apps/web/src/lib/room-client.ts
```

Replace the paths with the files you changed. For scoped TypeScript checks, use a temporary config extending the root `tsconfig.json` with those files as its `include` roots. Imported dependencies are still checked; a file-only `tsc` invocation without the project configuration does not reproduce the application's aliases or compiler options.

Repository-wide scripts are available for an explicitly full verification run and CI:

| Command                | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `bun run test`         | Run Bun unit and integration tests           |
| `bun run lint`         | Run Oxlint and TypeScript checks             |
| `bun run format:check` | Check configured source and config paths     |
| `bun run knip`         | Find unused files, exports, and dependencies |
| `bun run test:e2e`     | Run the UI project, then WebContainer tests  |

CI also runs `bun run build` and checks migrations against a fresh database. The unused-code audit is currently advisory in CI (`--no-exit-code`). A local documentation edit does not need an application build or a whole-project formatter. The formatting script does not include Markdown; run `bun --no-env-file x --no-install oxfmt --check` with the changed document paths, and check their links and code examples.

## Runtime boundaries

Keep these responsibilities separate:

- UI components translate user interaction into shared document or local runtime actions.
- `RoomClient` composes `RoomTransport`, `RoomDocument`, `RoomPresence`, and the outbox; it does not execute project code.
- `RoomDrafts` uses the narrow `DraftSyncPort` for browser-local backup and recovery, without depending on transport internals.
- `RoomTypeScriptIntelligence` derives versioned source snapshots from Loro and owns one lazy Worker implementation per room session. An injected `EditorIntelligence` can replace it in focused tests. Compiler analysis runs exclusively in the Worker; language services become unavailable after its single retry is exhausted. CodeMirror providers use only the asynchronous `EditorIntelligence` contract.
- Scoped Jotai atoms own workspace UI state; collaborative documents, presence, and persistence stay outside the atom store.
- `RoomService` validates room messages and broadcasts them; it does not render or preview files.
- `WebContainerRuntime` owns browser-local dependency installation and preview processes.
- Project declarations come from its bounded filesystem-only scanner after installation; the TypeScript Worker analyzes them together with explicitly loaded official standard libraries.
- `packages/shared` is the contract between browser and server.

`useRoomSession` owns the room lifecycle and subscriptions; `useWorkspaceController` composes navigation, follow, preferences, focus, and shortcut hooks. `usePreviewRuntime` subscribes to file text directly. Preserve this separation: text-only edits should not rebuild AppShell's workspace metadata. See the [invalidation diagram](architecture.md#frontend-invalidation-ownership).

When changing a protocol message or project field, update shared tests and both consumers. Keep the client outbox's acknowledgement and replay contract intact. Web and server must be deployed at the same version. Preview lifecycle changes need browser coverage because unit tests cannot prove iframe or WebContainer behavior.

The starter is defined in [default-project-files.ts](../packages/shared/src/default-project-files.ts); changing it affects new rooms only. Its package versions and Rolldown overrides are intentional. [webcontainer-files.ts](../apps/web/src/lib/webcontainer-files.ts) retains a compatibility transform for older Vite rooms without their own override, and only changes the browser-mounted copy. Validate dependency updates in a real preview before removing it.

The Worker imports the `typescript-legacy` package alias for the TypeScript 6 runtime, independently of tooling's TypeScript 7 compiler. Both dependencies in [package.json](../package.json) serve different purposes; a tooling upgrade does not upgrade the browser language service. After one Worker retry, language services become unavailable while editing, Vim, and collaboration remain active. Unsafe or oversized snapshots are rejected. See the [TypeScript intelligence guide](typescript-intelligence.md) for ownership, budgets, and failure behavior.

## Test data and browser tests

Playwright starts its own in-memory server on `3003` and Vite on `5175`. It does not reuse running servers or load environment files. Keep those ports free. Development servers on `3001` / `5173` can stay running. The test server raises room capacity and shortens idle retention to accommodate independent cases; production defaults are unchanged.

Use unique, valid room IDs. Create separate browser contexts for collaborators so they do not share local-storage identities. Keep real WebContainer startup and recovery scenarios in `e2e/preview.spec.ts`: the `preview` project runs with one worker. The ordinary `ui` project uses two workers locally; main-branch CI runs the smaller one-worker `smoke` project plus the tagged preview smoke test, while release candidates, version tags, and manual runs execute the complete suite with one worker because the CI runner is resource constrained.

Install the browser once, then run the relevant project or file:

```bash
bun --no-env-file x --no-install playwright install chromium
bun --no-env-file x --no-install playwright test --project=ui
bun --no-env-file x --no-install playwright test e2e/dialog-escape.spec.ts --project=ui --workers=1 --reporter=line
bun --no-env-file x --no-install playwright test --project=preview --no-deps
```

`--no-deps` is for an isolated preview run, not proof that UI checks passed. A normal `bun run test:e2e` runs both projects in dependency order. A failed UI project prevents its dependent preview project from running.

### Browser CI

Browser CI runs on pushes to `main`, version tags, manual dispatches, and PRs marked by the `release` label, a `chore(release):` title, or a `release/` branch. Main pushes use the focused `smoke` project and one real preview smoke test; release and manual runs retain the complete browser suite with a 60-minute job timeout. Ordinary PRs still run the quality workflow. See [the workflow](../.github/workflows/e2e.yml) for the exact condition. The browser job is independent of the release and Docker publishing jobs; their success does not establish that browser checks passed.

Inspect Playwright's retained trace, screenshot, and video on failure. Report the failing step and distinguish application regressions from unavailable browser capabilities or dependency downloads. Keep diagnostic artifacts out of source control, and do not replace failing assertions with retries or skips without a cause.

## Editor performance checks

Run the editor and file-tree benchmarks with one worker to avoid competing browser workloads:

```bash
bun --no-env-file x --no-install playwright test e2e/editor-performance.spec.ts e2e/file-tree-performance.spec.ts --project=ui --workers=1 --reporter=line --output=/tmp/tsugite-performance
```

The editor benchmark mounts the real workspace through a test-only React Profiler entry. It compares 500 and 10,000 lines of TypeScript, types at the end of the document, and verifies that edits reach the CRDT document. It also checks bounded CodeMirror DOM rows and page-scroll containment at desktop and narrow widths. WebSocket delivery and WebContainer execution are controlled fixtures; this is not a server-throughput or real-preview benchmark.

The attached `editor-benchmark.json` records first-highlight time, workspace-subtree commit counts, React render durations, and the interval from `beforeinput` to the next animation frame. First-highlight time starts at navigation's app initialization and ends when the editor marks its first successful Highlights result; the input interval is a responsiveness proxy, not a paint measurement or INP. `editor-typing.cpuprofile` can be opened in Chrome DevTools to identify CPU hotspots. The tests retain StrictMode and development instrumentation, so compare runs under the same browser, viewport, source, and worker count; do not treat absolute timings as production budgets. Timing samples are reported, while assertions enforce functional and DOM-size invariants.

When preparing large fixtures, insert the source directly into an empty Loro text instead of calling `update` on unrelated content. The latter computes a text diff and can dominate test setup before the browser starts. Keep all profiler hooks in `e2e/`; the normal application entry does not import them.

The benchmark intercepts both plain and cache-busted Vite entry URLs and asserts that the profiler has recorded a commit before collecting input samples. Otherwise, a `main.tsx?t=...` entry can bypass the harness while normal editing still works, producing an invalid zero-sample result. It also waits for worker highlighting before typing so an unloaded highlighter cannot make a run appear faster.

The file-tree benchmark compares the starter with a room containing 5,000 generated files. It records mount time and rendered row counts in `file-tree-benchmark.json`, then scrolls to verify virtualized rows remain bounded. WebSocket messages use controlled snapshots; it does not measure database reads or network throughput.

The benchmark also selects the final declaration with Go to definition and records `editor-first-definition.json`. This measures the command click through the verified browser selection, including automation and rendering overhead, not isolated compiler CPU time. These controlled fixtures do not measure a real WebContainer preview or establish a budget for arbitrary projects.

`preview-preflight.spec.ts` uses the browser clock and the real Babel validator to assert that a burst produces only one validation, cancelled module loads do not parse, and runtime progress remains visible while the debounce is pending. Only the external container runtime is replaced in those cases; `preview.spec.ts` owns real WebContainer startup and recovery verification.

### TypeScript Worker checks

[typescript-import-index.spec.ts](../e2e/typescript-import-index.spec.ts) exercises a code-dense 512-file / 16 MiB workspace in Chromium. It verifies event-loop yielding and records cold indexing, unchanged-cache and single-file-edit timings separately. The eight-millisecond slice is checked between files, not a preemption deadline for an individual file.

[typescript-worker-benchmark.spec.ts](../e2e/typescript-worker-benchmark.spec.ts) creates the actual production Worker through Vite on an isolated page. It checks official Promise and DOM types, installed React/JSX declarations, package `types` entries, diagnostics, and completion at 3, 128, and 512 source files. Each workspace records 30 samples per query both unchanged and after source edits, verifies that all queries succeed, and disposes its Worker.

Run the focused language-service suites and benchmark from the repository root:

```bash
bun --no-env-file test apps/web/src/lib/typescript-intelligence.test.ts apps/web/src/lib/typescript-worker-client.test.ts apps/web/src/lib/typescript-worker-session.test.ts apps/web/src/lib/typescript-standard-library.test.ts apps/web/src/lib/typescript-declarations.test.ts apps/web/src/lib/webcontainer-declaration-scan.test.ts apps/web/src/lib/webcontainer-declarations.test.ts apps/web/src/lib/room-typescript-intelligence.test.ts apps/web/src/lib/preview-typescript-declarations.test.ts
bun --no-env-file x --no-install playwright test e2e/editor-language-loading.spec.ts e2e/editor-context-menu.spec.ts --project=ui --workers=1 --reporter=line
bun --no-env-file x --no-install playwright test e2e/typescript-import-index.spec.ts e2e/typescript-worker-benchmark.spec.ts e2e/typescript-worker-project.spec.ts e2e/typescript-worker-input.spec.ts --project=ui --workers=1 --reporter=line --output=/tmp/tsugite-typescript-worker
```

The attached `typescript-worker-benchmark` JSON reports constructor-to-first-hover startup time, publish and query p50/p95, main-thread long tasks, a 16 ms timer heartbeat, and the Dedicated Worker's CDP V8 heap (`usedSize`, `totalSize`, `embedderHeapUsedSize`, and `backingStorageSize`). It also measures 10 hover, completion, and diagnostic queries with a legal maximum workspace of 512 source files / 16 MiB plus 1,024 declarations / 8 MiB; the separate worker-project suite checks exact-limit rejection and recovery. The Worker is measured while alive and the page target heap is recorded separately. Startup includes Worker/compiler loading and standard-library assets. The heartbeat is an event-loop responsiveness proxy, not paint or INP. These browser-specific heap values are a repeatable local comparison, not total process memory or proof of a memory-leak conclusion. Maximum-budget fixture padding does not model pathological type complexity or every real project dependency graph.

These suites measure Chromium against Vite's development server, with potentially warm Vite and browser caches. They do not establish production cold-start or bundle-size results. The isolated benchmark does not exercise rendered UI, collaboration, or real WebContainer installation; the editor and preview suites own those boundaries. Re-run focused failure tests and the benchmark after compiler, declaration-loader, or Worker lifecycle changes. Replacing the engine with TypeScript 7 remains gated on [official browser support](architecture.md#typescript-intelligence), not the tooling compiler version.

The [real-input suite](../e2e/typescript-worker-input.spec.ts) mounts the production AppShell, CodeMirror, room owner, and Worker. It checks five rounds of 24 input events under concurrent hover, completion, and diagnostics, confirms a successful reply from each method during every round, verifies Loro delivery and definition navigation, and records input-to-frame latency and main-thread long tasks. It runs both a representative workspace and 512 source files / 16 MiB minus 4 KiB of typing reserve plus 1,024 declarations / 8 MiB. WebSocket delivery and declaration reads are controlled fixtures; this does not validate actual dependency installation. The real WebContainer preview suite owns that boundary.

The benchmarks report startup, query p50/p95, main-thread long tasks, input-to-frame intervals, heartbeat jitter, Worker heap, and lifecycle counts. The Worker query suite enforces a coarse two-second p95 limit for its fixtures; this is not a production latency target. Other timing and heap samples are observations, while assertions enforce successful queries, cleanup, and functional invariants. Lifecycle counts cover controlled readiness, retry, and unavailable cases, not a production fault rate. Compare measurements under matching conditions and record production cold-start and fault-rate observations separately after deployment.
