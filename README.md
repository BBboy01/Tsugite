# Tsugite Multiplayer Editor

A small multiplayer code editor built with Bun, React, Elysia, CodeMirror 6, and Loro CRDT.

Tsugite connects collaborators through shared code, files, themes, fonts, and live previews. Each new multiplayer room starts with a shared React + TypeScript + Vite + Tailwind CSS project. All starter files are stored in the room's Loro document, so collaborators can edit the app together and preview it through WebContainer.

## Development

Install dependencies and start the two local processes:

```bash
bun install
bun run dev:server
bun run dev:web
```

Open `http://127.0.0.1:5173/room/demo` in two browser tabs to test collaboration. On first entry, Tsugite generates an anonymous Faker username and keeps the identity in the current browser profile. You can edit the name or avatar color from the current-user card in the lower-left corner.

The current MVP keeps room documents in memory. Stopping the Bun server resets rooms to the example project. Projects with a root `package.json` run in a browser-local WebContainer: Tsugite mounts the shared files, runs the standard `pnpm install`, then starts `scripts.dev` (falling back to `scripts.start`). Source edits are synced incrementally so the project dev server can hot-update the preview. Projects without `package.json` keep the single-file Babel iframe fallback.

WebContainer requires a cross-origin isolated page. The included Vite configuration sends the required `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers in development and preview mode. Each browser creates its own runtime; the Bun server only synchronizes the Loro document and never executes project commands.

## Checks

```bash
bun run test
bunx tsc --noEmit --pretty false
bun run lint
bun run format:check
bun run build
bun run test:e2e
```
