# Getting started

## Requirements

- Bun matching [`.bun-version`](../.bun-version)
- Docker with Compose support, only if using the containerized deployment
- A browser with cross-origin isolation and WebContainer support for project previews

## Run locally

From the repository root, install dependencies, then run each development process in a separate terminal:

```bash
bun install
bun run dev:server
bun run dev:web
```

The web process serves the editor at `http://127.0.0.1:5173`. Open a room by appending `/room/<room-id>`, for example:

```text
http://127.0.0.1:5173/room/demo
```

The server and web process are intentionally separate. Keep both running while using the editor. On startup, the server runs the checked-in Drizzle migrations and stores room snapshots in `./data/tsugite.sqlite` by default.

## Try collaboration

1. Open the same room URL in two tabs or browsers.
2. Edit a file in one tab and watch the change arrive in the other.
3. Open the presence list to follow another collaborator.
4. Use the file tree context menu to create, rename, copy, or delete files.
5. Open shared settings to change the theme, editor behavior, Vim mode, keymaps, or preview runtime.

New rooms start from the shared example project. The current user receives an anonymous browser-local identity that can be renamed from the user card.

## Preview requirements

Projects with a root `package.json` run in a browser-local WebContainer. The runtime mounts the shared files, installs dependencies with the selected package manager, and starts `scripts.dev`, falling back to `scripts.start`.

The development server supplies:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

If the preview remains unavailable, check the browser's cross-origin isolation and storage-partitioning support first. A project without `package.json` uses the single-file Babel iframe fallback.

## Stop and reset

Stop the terminal processes with `Ctrl-C`. Room snapshots survive server restarts. To use another database location, set `DATABASE_PATH` before starting the server.

## Database migrations

Generate a migration after changing `apps/server/src/db/schema.ts`, then apply it locally:

```bash
bun run db:generate --name=describe_the_change
bun run db:migrate
```

Migration files under `drizzle/` are committed to the repository. Runtime SQLite files under `data/` are local deployment state and are ignored by Git.
