<p align="center">
  <img src="apps/web/public/tsugite-mark.svg" width="72" alt="Tsugite mark" />
</p>

<h1 align="center">Tsugite</h1>

<p align="center">Edit code together in the browser, with shared rooms and local live previews.</p>

<p align="center">
  <a href="https://deepwiki.com/BBboy01/Tsugite"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki" /></a>
</p>

<p align="center">
  <a href="docs/getting-started.md">Get started</a> ·
  <a href="docs/deployment.md">Deploy</a> ·
  <a href="docs/architecture.md">Architecture</a>
</p>

<p align="center">
  <img src="docs/assets/workspace.png" alt="Tsugite workspace with a shared file tree, code editor, and live preview" />
</p>

Tsugite is a collaborative code editor for small, shared rooms. Multiple people can edit the same project, follow each other's cursors, and see a live preview in the browser.

Each new room starts with a React, TypeScript, Vite, and Tailwind project. Loro CRDT synchronizes edits, and SQLite stores the room's files, folders, and shared settings. Each browser runs the project in WebContainer; the server never executes user project code.

## See it in action

The workspace keeps the file tree, editor, preview, output, and room presence in one place. Open the same room URL in a separate browser profile to try collaboration with two identities.

<details>
<summary>Open the shared settings view</summary>

<p align="center">
  <img src="docs/assets/settings.png" alt="Tsugite shared settings dialog with searchable sections and theme choices" />
</p>
</details>

## What it includes

- Shared files, folders, workspace settings, cursors, and presence, with SQLite persistence for project data
- CodeMirror 6 with Vim mode, relative line numbers, configurable cursors, fuzzy file search, Command Palette, and keymaps
- TypeScript navigation, references, hover information, and inline Peek
- Browser-local live previews with incremental file synchronization and runtime recovery actions
- Anonymous room identities with editable display names and avatar colors
- Docker Compose deployment with Caddy serving the web app and proxying WebSocket traffic

## Quick start

Requirements:

- [Bun](https://bun.sh/) matching [`.bun-version`](.bun-version)
- A browser that supports cross-origin isolation and WebContainer

Clone the repository and install its locked dependencies:

```bash
git clone https://github.com/BBboy01/Tsugite.git
cd Tsugite
bun install --frozen-lockfile
```

Start the server in one terminal:

```bash
bun run dev:server
```

Start the web app in another:

```bash
bun run dev:web
```

Open [http://127.0.0.1:5173/room/demo](http://127.0.0.1:5173/room/demo). The server applies migrations on startup and stores room data in `data/tsugite.sqlite`. Share the room URL with another browser profile or teammate using the same deployment.

For Docker Compose or published images, see the [deployment guide](docs/deployment.md). Use the documentation from the same revision as the code or images you deploy.

## Documentation

- [Getting started](docs/getting-started.md): room usage, shortcuts, settings, and preview troubleshooting
- [Development guide](docs/development.md): repository layout, local workflows, and verification
- [Deployment guide](docs/deployment.md): Docker Compose, Caddy, images, and configuration
- [Architecture](docs/architecture.md): runtime boundaries, data flow, and failure boundaries
- [Contributing](CONTRIBUTING.md): focused changes, verification, commits, and dependency updates

## Verification

Run unit and integration tests:

```bash
bun run test
```

Use the [development guide](docs/development.md#verification) for scoped static checks and browser tests. Playwright starts isolated test servers on ports `3003` and `5175`; it does not reuse development servers or the development database. Browser CI runs for release candidates, version tags, and manual runs.

## Current limitations

- Room access is based on the room URL; there is no authentication or authorization layer yet.
- Deploy one room-server process. Live room state is not coordinated across replicas.
- Snapshots normally reach SQLite within about 500 ms. The connection indicator is not a durable-save receipt, and unsent browser edits do not survive a page reload.
- Project dependencies and preview processes run independently in each collaborator's browser.
- A project without a root `package.json` uses the single-file Babel iframe fallback instead of WebContainer.
- See [resource limits and recovery](docs/deployment.md#resource-limits) before exposing a deployment to the internet.
