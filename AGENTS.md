# Repository Guidelines

## Project Structure

- `apps/web/` contains the React/Vite editor, workspace UI, and browser-local preview runtime.
- `apps/web/public/` contains static assets served by the web app.
- `apps/server/` contains the Elysia WebSocket server, room lifecycle, and SQLite persistence.
- `packages/shared/` owns shared project models, settings, protocol types, and CRDT helpers.
- `drizzle/` stores checked-in migrations and snapshots; `e2e/` contains Playwright browser tests; `docs/` contains development, architecture, and deployment guides.

Keep cross-runtime contracts in `packages/shared/`. Web and server protocol changes must update both consumers and their tests.

## Setup and Development

Use the Bun version pinned in `.bun-version`. Install dependencies with `bun install --frozen-lockfile`. Run the server and web app in separate terminals with `bun run dev:server` and `bun run dev:web`.

Useful checks:

- `bun run test` runs unit and integration tests.
- `bun run lint` runs Oxlint and TypeScript checks.
- `bun run format:check` checks formatting.
- `bun run build` creates the production web bundle.
- `bun run test:e2e` runs Playwright UI and preview workflows.

Browser E2E is release/manual-only in CI. Run affected Playwright tests locally for UI or preview changes; ordinary PR CI does not validate browser interactions.

## Style and Tests

Use two-space indentation and the existing TypeScript and React patterns. Name React components in PascalCase and hooks as `useXxx` (for example, `useWorkspaceController`); keep module filenames in kebab-case. Put unit tests beside their modules as `*.test.ts(x)` and browser tests in `e2e/*.spec.ts`. Format with Oxfmt and lint with Oxlint; while iterating, scope checks to changed files. Add regression tests for bug fixes and exercise keyboard/focus behavior for editor UI changes. CI uploads LCOV coverage to Codecov; no percentage threshold is configured.

## Database Changes

Edit `apps/server/src/db/schema.ts`, then generate a named migration with `bun --no-env-file run db:generate --name=describe_the_change`. Review and commit the full generated migration directory, including its snapshot. Never rewrite migrations that have shipped. Test schema changes against a disposable database; server startup applies pending migrations.

## Commits and Pull Requests

Use Conventional Commits, for example `feat(editor): add shared selection colors` or `fix(room): preserve state after reconnect`. Keep PRs focused and link related issues when applicable. Describe user-visible changes, runtime boundaries, verification results, and remaining limitations; include screenshots for visual changes when useful. Call out migrations, backup needs, protocol changes, and coordinated web/server deployment requirements. Do not commit credentials, runtime databases, or test artifacts.
