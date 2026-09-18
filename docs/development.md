# Development guide

[Documentation home](../README.md#documentation) · [Architecture](architecture.md) · [Contributing](../CONTRIBUTING.md)

## Repository layout

```text
apps/web/       React application, editor, settings, preview, and browser state
apps/server/    Elysia WebSocket server, room service, and SQLite persistence
packages/shared Shared project model, settings, protocol, and CRDT helpers
e2e/            Playwright browser workflows
docs/           Project and operational documentation
```

The browser owns editor state, preferences, and WebContainer execution. Its unacknowledged edits are held in memory, not durable browser storage. The server owns room membership, presence relay, the in-memory Loro document, and SQLite snapshots. Shared types and transformations belong in `packages/shared`.

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
- `RoomClient` transports document and presence changes; it does not execute project code.
- `RoomService` validates room messages and broadcasts them; it does not render or preview files.
- `WebContainerRuntime` owns browser-local dependency installation and preview processes.
- `packages/shared` is the contract between browser and server.

`useRoomSession` subscribes to workspace/settings changes; `useWorkspaceController` owns tabs, follow state, shortcuts, and file actions. `usePreviewRuntime` subscribes to file text directly. Preserve this separation: text-only edits should not rebuild AppShell's workspace metadata. See the [invalidation diagram](architecture.md#frontend-invalidation-ownership).

When changing a protocol message or project field, update shared tests and both consumers. Keep the client outbox's acknowledgement and replay contract intact. Web and server must be deployed at the same version. Preview lifecycle changes need browser coverage because unit tests cannot prove iframe or WebContainer behavior.

The starter is defined in [default-project-files.ts](../packages/shared/src/default-project-files.ts); changing it affects new rooms only. Its package versions and Rolldown overrides are intentional. [webcontainer-files.ts](../apps/web/src/lib/webcontainer-files.ts) retains a compatibility transform for older Vite rooms without their own override, and only changes the browser-mounted copy. Validate dependency updates in a real preview before removing it. The TypeScript language service also uses the `typescript-legacy` alias in [vite.config.ts](../vite.config.ts), separately from the compiler used by `tsc`.

## Test data and browser tests

Playwright starts its own in-memory server on `3003` and Vite on `5175`. It does not reuse running servers or load environment files. Keep those ports free. Development servers on `3001` / `5173` can stay running. The test server raises room capacity and shortens idle retention to accommodate independent cases; production defaults are unchanged.

Use unique, valid room IDs. Create separate browser contexts for collaborators so they do not share local-storage identities. Keep real WebContainer startup and recovery scenarios in `e2e/preview.spec.ts`: the `preview` project runs with one worker after `ui` completes. UI tests use two local workers and one in CI.

Install the browser once, then run the relevant project or file:

```bash
bun --no-env-file x --no-install playwright install chromium
bun --no-env-file x --no-install playwright test --project=ui
bun --no-env-file x --no-install playwright test e2e/dialog-escape.spec.ts --project=ui --workers=1 --reporter=line
bun --no-env-file x --no-install playwright test --project=preview --no-deps
```

`--no-deps` is for an isolated preview run, not proof that UI checks passed. A normal `bun run test:e2e` runs both projects in dependency order. A failed UI project prevents its dependent preview project from running.

Browser CI is reserved for version tags, manual dispatches, and PRs marked by the `release` label, a `chore(release):` title, or a `release/` branch. Ordinary PRs still run the quality workflow. See [the workflow](../.github/workflows/e2e.yml) for the exact condition.

Inspect Playwright's retained trace, screenshot, and video on failure. Report the failing step and distinguish application regressions from unavailable browser capabilities or dependency downloads. Keep diagnostic artifacts out of source control, and do not replace failing assertions with retries or skips without a cause.
