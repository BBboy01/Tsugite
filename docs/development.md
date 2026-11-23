# Development guide

[Documentation home](../README.md#documentation) · [Testing](testing.md) · [Architecture](architecture.md) · [Contributing](../CONTRIBUTING.md)

## Repository layout

```text
apps/web/       React application, editor, settings, preview, and browser state
apps/server/    Elysia WebSocket server, room service, and SQLite persistence
packages/shared Shared project model, settings, protocol, and CRDT helpers
drizzle/        Checked-in Drizzle migrations and snapshots
e2e/            Playwright browser workflows and profiling harnesses
.github/        CI, release, image publishing, and dependency automation
docs/           User, development, testing, deployment, and architecture guides
```

Start with the [documentation index](../README.md#documentation) or the [architecture source map](architecture.md#source-map) to find a module. Keep user workflows in Getting started, operational procedures in Deployment, verification and benchmarks in Testing, runtime ownership in Architecture, and Worker limits in [TypeScript intelligence](typescript-intelligence.md). The shared package name remains `@iris/shared` even though the product is called Tsugite.

The browser owns editor state, preferences, and WebContainer execution. Unacknowledged edits remain in the in-memory outbox and are checkpointed to IndexedDB for explicit draft recovery. Local backup requires IndexedDB and Web Locks; storage eviction or an unfinished checkpoint can still lose edits. A local checkpoint and a server acknowledgement are separate from SQLite persistence. See [local draft recovery](architecture.md#local-draft-recovery). The server owns room membership, presence relay, the in-memory Loro document, and SQLite snapshots. Shared types and transformations belong in `packages/shared`.

## Local workflow

Use the exact Bun npm build in [`.bun-version`](../.bun-version):

```bash
npm install --global "bun@$(cat .bun-version)"
bun --revision
bun install --frozen-lockfile
```

The pinned npm package resolves to `bun --revision` output `1.4.6-canary.1+ca7729d01`. A canary is required because native lint is not enabled in stable Bun 1.4.5. CI, releases, and browser tests use the same npm build through the shared [setup action](../.github/actions/setup-bun/action.yml); the upstream setup action cannot resolve these npm-only canary versions. The Dockerfiles pin matching canary images by digest. Update the npm version and both image digests together, and verify their `bun --revision` output when upgrading.

Start the server and web app together from the repository root:

```bash
bun run dev
```

Bun prefixes each process's output with its script name. Press Ctrl+C to stop
both processes and let the server flush pending room snapshots. If SQLite is
temporarily locked, shutdown retries for up to five seconds; allow it to finish
before closing the terminal. A startup failure stops the other process too.
The small [launcher](../scripts/dev.ts) forwards SIGINT/SIGTERM as a single
SIGINT to Bun's parallel runner and waits for it, preserving the server's
asynchronous shutdown. The server does not use `--watch` or `--hot`.

The individual commands remain available in separate terminals:

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
VITE_WS_URL=ws://127.0.0.1:3002/ws bun --no-env-file run dev:web --host 127.0.0.1 --port 5174 --strictPort
```

The client appends the room ID to `VITE_WS_URL`. `:memory:` is useful for disposable backend checks and loses all room data when the process exits. `bun --no-env-file` disables Bun's automatic environment-file loading; Vite has its own environment handling. The [E2E configuration](../e2e/vite.config.ts) disables Vite environment files too. Production configuration is covered in [deployment](deployment.md#configuration).

### Build output

`bun run build` writes the static application to `apps/web/dist`. `bun run preview` serves that output for local inspection; it does not start the room server or proxy WebSockets. Production builds default to same-origin `/ws`, so local bundle inspection needs a matching proxy or a `VITE_WS_URL` set when building. Use [Docker Compose](deployment.md#docker-compose) to inspect the packaged web/server setup.

The build script explicitly runs the installed Vite CLI with the pinned Bun
runtime using `bun --no-env-file run --bun vite build`. A plain `bun run` can
honor Vite's Node shebang instead. Vite still owns bundling, React, Tailwind,
WASM, and Worker output. CI and releases call this same script after installing
the pinned Bun; the web Docker build uses its matching image digest. This does
not change the runtimes of `dev:web`, `preview`, Playwright's Vite server, or
projects running inside WebContainer.

To diagnose a Bun compatibility issue, run the same Vite build with Node:

```bash
node node_modules/vite/bin/vite.js build --config vite.config.ts
```

Keep inputs, environment, and cache conditions equal when comparing the two
commands. Vite loads its own environment files in both cases. Output hashes can
differ because Vite serializes runtime helper functions; verify loaded assets
and browser behavior instead of requiring byte-identical bundles. Existing
chunk-size and mixed static/dynamic import warnings are not runtime benchmarks.

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

Use the [check selection table](testing.md#choose-checks) to choose coverage, then run focused tests and static checks while iterating:

```bash
bun --no-env-file test apps/server/src/room-reconnect.test.ts
bun --no-env-file lint --no-script apps/web/src/lib/room-client.ts
bun --no-env-file check apps/web/src/lib/room-client.ts
bun --no-env-file fmt --check apps/web/src/lib/room-client.ts
```

Replace the paths with the files you changed. `bun check` uses the nearest `tsconfig.json` and checks the supplied files and their imports, preserving the application's aliases and compiler options. `--no-script` forces the built-in linter even though this repository also defines a `lint` script.

Repository-wide scripts are available for an explicitly full verification run and CI:

| Command                | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `bun run test`         | Run Bun unit and integration tests           |
| `bun run lint`         | Run built-in Bun lint and type checks        |
| `bun run typecheck`    | Run built-in Bun TypeScript checks           |
| `bun run format:check` | Check all supported, non-ignored files       |
| `bun run knip`         | Find unused files, exports, and dependencies |
| `bun run test:e2e`     | Run the UI project, then WebContainer tests  |

CI also runs `bun run build` and checks migrations against a fresh database. The unused-code audit is currently advisory in CI (`--no-exit-code`). A local documentation edit does not need an application build or a whole-project formatter. The root formatting script and staged-file hooks include Markdown; use scoped [documentation checks](testing.md#documentation-checks) while iterating.

### Tooling coverage

Formatting uses Bun defaults without a compatibility configuration. [bunfig.toml](../bunfig.toml) excludes local agent artifacts and generated, shipped database migrations from formatting. Bun embeds the project type checker, so no standalone development compiler is required. Keep `typescript-legacy`: browser language services and their standard-library assets import it at runtime.

Lint uses Bun's recommended defaults with the explicit overrides in [bunfig.toml](../bunfig.toml). Rule and diagnostic parity with the previous linter is not an acceptance gate. Broad correctness/suspicious categories are not enabled: in this build they also enable additional React compiler, accessibility, and type-aware rules that the previous configuration did not run. Type-aware rules and third-party plugins are not enabled. The default React dependency checks currently report existing warnings; review them separately from this migration. Re-run `bun lint --no-script --doctor` and the repository checks on every Bun version update, review newly supported or changed rules, and switch to a stable build once native lint ships there.

The current doctor report enables 96 rules: ESLint, TypeScript, Bun tests, React, and React Hooks. The previous plugin configuration's category-based OXC and Unicorn coverage is not carried over; for example, consistent function scoping and postMessage target-origin checks are no longer enabled. Their obsolete suppressions were removed. Reassess these gaps on the next Bun upgrade rather than treating the migration as rule-for-rule parity.

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

The Worker imports the `typescript-legacy` package alias for the TypeScript 6 runtime, independently of Bun's embedded project type checker. The browser compiler remains a runtime dependency in [package.json](../package.json); a tooling upgrade does not upgrade the browser language service. After one Worker retry, language services become unavailable while editing, Vim, and collaboration remain active. Unsafe or oversized snapshots are rejected. See the [TypeScript intelligence guide](typescript-intelligence.md) for ownership, budgets, and failure behavior.

## Test data and browser tests

See the [testing guide](testing.md#browser-tests) for isolated servers, project selection, alternate ports, and retained failure artifacts. It also owns [editor performance checks](testing.md#editor-performance-checks) and [TypeScript Worker checks](testing.md#typescript-worker-checks).

### Browser CI

Main pushes run smoke tests; release candidates, version tags, and manual runs use the full suite. The [CI matrix](testing.md#browser-ci) explains the triggers and the relationship to release and image publishing jobs.

## Editor performance checks

Commands, fixtures, attachments, and measurement limits are in [Testing](testing.md#editor-performance-checks).

### TypeScript Worker checks

Language-service unit suites, browser recovery checks, and benchmarks are in [Testing](testing.md#typescript-worker-checks).
