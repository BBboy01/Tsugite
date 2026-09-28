# Getting started

[Documentation home](../README.md#documentation) · [Deployment](deployment.md) · [Development](development.md)

## Requirements

- Bun matching [`.bun-version`](../.bun-version)
- Docker with Compose support, only if using the containerized deployment
- A browser with cross-origin isolation and WebContainer support for project previews

## Run locally

From the repository root, install the locked dependencies:

```bash
bun install --frozen-lockfile
```

Keep the server running in one terminal:

```bash
bun run dev:server
```

Start the web app in a second terminal:

```bash
bun run dev:web
```

The web process normally serves the editor at `http://127.0.0.1:5173`; use the URL printed by Vite if that port is occupied. Open a room by appending `/room/<room-id>`, for example:

```text
http://127.0.0.1:5173/room/demo
```

The server listens on port `3001`. On startup, it applies checked-in Drizzle migrations and stores room snapshots in `./data/tsugite.sqlite`; no separate migration command is required for a normal first run. For a containerized setup, follow the [deployment guide](deployment.md).

Room IDs contain 1-80 ASCII letters, digits, underscores, or hyphens. Opening an unused ID creates a project; reopening an existing ID restores it. The root URL uses the `demo` room. Room URLs have no access control, so share them only with people you trust.

## Try collaboration

1. Open the same room URL in two separate browser profiles, browsers, or devices connected to the same deployment.
2. Edit a file in one tab and watch the change arrive in the other.
3. Open the presence list to follow another collaborator.
4. Use the file tree context menu to create, rename, copy, or delete files. Creation and rename use an inline input; Enter or leaving the input commits the value, while an empty new path cancels. Deletion asks for confirmation and offers a separate undo action. Undo refuses paths that now conflict with collaborator changes.
5. Open shared settings to change the theme, editor behavior, Vim mode, keymaps, or preview runtime.

New rooms start from the shared example project and open `src/App.tsx`. The user card lets you change your anonymous display name and avatar color.

Identity is stored per browser origin. Two tabs in the same profile share an identity, so use separate profiles when testing two collaborators. Only one connection per identity is tracked in a room. `127.0.0.1` refers to the current device; a teammate needs the URL of a reachable deployment, not your local loopback address.

Click another member in the presence list to follow their active file, cursor, and selection. The editor outline indicates following; local editor interaction or selecting a file exits it. A file tab's `+N` badge counts other members currently active in that file, not everyone who has it open.

## Keyboard workflow

| Action                | macOS default | Windows / Linux default |
| --------------------- | ------------- | ----------------------- |
| Find a file           | `Cmd-P`       | `Ctrl-P`                |
| Open Command Palette  | `Cmd-K`       | `Ctrl-K`                |
| Open settings         | `Cmd-,`       | `Ctrl-,`                |
| Toggle preview output | `Cmd-J`       | `Ctrl-J`                |

File search ranks partial path matches and highlights contiguous matched characters. Use the arrow keys or `Ctrl-N` / `Ctrl-P` to move through results and `Enter` to open the selected file. `Esc` or clicking the backdrop closes the dialog.

The Command Palette searches workspace actions and settings. Use the arrow keys or `Ctrl-N` / `Ctrl-P` to move, and `Enter` to activate. `Esc` closes the root palette; from a submenu it returns to the root first. Clicking the backdrop closes the palette. Choosing a category opens its submenu; activating a final option applies it and closes the palette. While browsing the theme submenu, the selected theme is previewed locally. Closing or leaving the submenu restores the room's committed theme unless a theme was selected.

Settings > Keyboard displays the workspace shortcuts. `Mod` in the defaults means `Cmd` on macOS and `Ctrl` elsewhere, not a physical key. Explicit `Cmd` and `Ctrl` bindings remain distinct. Use the restore-default control to return a customized binding to its platform-aware default. Vim editor key bindings are separate from these workspace shortcuts.

Settings opens with the current sidebar item focused. Arrow keys switch the displayed section or search result without requiring `Enter`. `Tab` moves from the current menu item to search, through the right-hand controls, then back to the menu; `Shift-Tab` reverses the order. Search matches section names and setting labels or descriptions.

## Vim mode

Enable Vim mode in Settings > Keyboard. The mode indicator appears in the editor status bar only while Vim mode is enabled. Normal, insert, and visual modes use the Vim key behavior provided by the CodeMirror Vim integration. Search with `/` or `?`, move through matches with `n` and `N`, and use `*` on a visual selection to search for that text. The current search and its match count appear in the editor. Normal-mode cursor shape can be selected under Settings > Editor; its color follows the room's accent color. Relative line numbers are a shared editor setting and keep the active line's absolute number.

System clipboard integration is an optional browser-local setting. When enabled and permitted by the browser, Vim yank and paste use the system clipboard. The editor context menu also provides clipboard actions, undo/redo, select all, TypeScript navigation, references, and Peek where language services are available.

## Shared and local preferences

| Stored with the room                                 | Stored in your browser                     |
| ---------------------------------------------------- | ------------------------------------------ |
| Theme, editor font and size, word wrap               | Interface language                         |
| Relative line numbers and normal-mode cursor style   | Vim enabled/disabled                       |
| Package manager, automatic install and preview start | Keymap and Vim system-clipboard preference |

Shared preferences affect collaborators and survive server restarts. Browser preferences apply to that origin. Open tabs, current selection, follow state, and undo history are session state rather than persisted room settings.

Relative line numbers keep the current line's real number and show distances on other lines. Vim mode adds a mode indicator and configurable normal-mode cursor shapes. System clipboard integration requires browser permission. The editor context menu provides clipboard actions, TypeScript navigation, references, and Peek; unavailable targets are reported in the editor.

## Preview requirements

Projects with a root `package.json` run in a browser-local WebContainer. The runtime mounts the shared files, installs dependencies with the selected package manager, and starts `scripts.dev`, falling back to `scripts.start`.

The development server supplies:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

The selected package manager is `pnpm` by default; `npm` and `yarn` are also available. Install and automatic start settings are shared, but runtime processes and dependency files are local to each browser. Restart and reinstall actions are available in Settings > Runtime and Command Palette, and affect only your preview. Restart follows the install setting; reinstall forces dependency installation before starting. Neither action erases shared source files or restarts the room server.

A project without `package.json` uses the single-file Babel iframe fallback. It is not a replacement for a multi-file package runtime.

## Troubleshooting

| Symptom                          | Check                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Editor stays reconnecting        | Verify the room ID, server availability, and WebSocket connection. Both development processes must be running.                |
| No second collaborator appears   | Use separate browser profiles; tabs in one profile share the same identity.                                                   |
| Cross-origin isolation error     | Check `window.crossOriginIsolated` in browser DevTools. Preserve both headers above and use HTTPS for a remote deployment.    |
| Storage partitioning error       | Check browser storage/privacy settings for the WebContainer preview.                                                          |
| Dependency installation fails    | Read Output for registry or package errors. Installation has a two-minute deadline; try reinstall after correcting the cause. |
| Preview has no start command     | Add a `dev` or `start` script to the project's root `package.json`.                                                           |
| Preview is paused                | Enable automatic start or use Run preview.                                                                                    |
| Offline indicator mentions 1 MiB | A single encoded edit exceeded the limit. Copy local changes before reloading, then reapply them in smaller edits.            |

Automatic reconnect retries unacknowledged edits. The browser also checkpoints them to IndexedDB while pending; the connection indicator reports when the local draft has been saved. Reopening the same room offers **Restore draft** or **Discard draft**. Restore merges the draft with the current room and sends pending edits when connected; discard permanently removes only that local copy. Another active tab's draft is not offered for recovery. This is best-effort browser recovery, not a guarantee that every edit survives a crash, storage eviction, or unfinished checkpoint.

Local drafts require IndexedDB and Web Locks (HTTPS or localhost). If local backup is unavailable, keep the tab open until synchronized or copy your changes elsewhere. Drafts belong to this browser profile and server/room address, not your account. Browser storage clearing/eviction, private-session closure, or termination before a checkpoint finishes can still lose them. This is not a fully offline application cache: the application itself must be loadable to recover a draft.

If restoration merges successfully but the new backup cannot be saved, the dialog offers **Retry backup**. The original copy remains protected and cannot be discarded until replacement succeeds; retrying does not duplicate the edits.

The unload warning remains while edits are unacknowledged, even with a saved draft. A live connection or a server acknowledgement does not prove that the latest edit has reached SQLite. The normal snapshot window is about 500 ms; neither the browser checkpoint nor the acknowledgement extends it. See [persistence guarantees](deployment.md#persistence-and-upgrades).

## Stop and resume

Stop the terminal processes with `Ctrl-C`. Room snapshots survive server restarts. To use another database location, set `DATABASE_PATH` before starting the server.

Creating another room gives you a separate project without deleting existing rooms. Changing `DATABASE_PATH` selects another database; it does not move existing data. Schema changes and migration generation belong to the [development workflow](development.md#database-migrations).
