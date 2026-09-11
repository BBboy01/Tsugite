# Development guide

## Repository layout

```text
apps/web/       React application, editor, settings, preview, and browser state
apps/server/    Elysia WebSocket server and in-memory room service
packages/shared Shared project model, settings, protocol, and CRDT helpers
e2e/            Playwright browser workflows
docs/           Project and operational documentation
```

The browser owns editor state, WebContainer execution, and local persistence. The server owns room membership, presence relay, and the in-memory Loro document. Shared types and transformations belong in `packages/shared`.

## Local workflow

Start the server and web app in separate terminals:

```bash
bun run dev:server
bun run dev:web
```

Useful commands:

| Command                | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `bun run test`         | Run Bun unit and integration tests           |
| `bun run lint`         | Run Oxlint and TypeScript checks             |
| `bun run format:check` | Check repository formatting                  |
| `bun run knip`         | Find unused files, exports, and dependencies |
| `bun run build`        | Build the web application                    |
| `bun run test:e2e`     | Run Playwright browser tests                 |

For a focused iteration, run the smallest relevant test file first. Before opening a pull request, select checks for the changed surface using [CONTRIBUTING.md](../CONTRIBUTING.md).

## Runtime boundaries

Keep these responsibilities separate:

- UI components translate user interaction into shared document or local runtime actions.
- `RoomClient` transports document and presence changes; it does not execute project code.
- `RoomService` validates room messages and broadcasts them; it does not render or preview files.
- `WebContainerRuntime` owns browser-local dependency installation and preview processes.
- `packages/shared` is the contract between browser and server.

When changing a shared message or project field, update both the shared tests and the browser/server consumers. When changing preview lifecycle behavior, add a browser regression test because a unit test cannot prove iframe and WebContainer timing.

## Test data and browser tests

Use unique room IDs when adding browser tests to avoid sharing mutable state between tests. Playwright automatically starts the web and server processes, or reuses running local instances. The browser workflow is intentionally gated in GitHub Actions and runs for release candidates, version tags, and manual dispatches.

For local browser debugging:

```bash
bunx playwright test e2e/room.spec.ts --workers=1 --reporter=line
```

The browser must be able to use WebContainer. If the environment cannot provide cross-origin isolation, distinguish that setup failure from application failures in the test report.
