# Tsugite Architecture

```mermaid
flowchart LR
  Browser["Browser"]
  Shell["React AppShell"]
  Editor["CodeMirror 6 EditorPane"]
  Tree["FileTree and Settings"]
  Preview["WebContainer Preview"]
  Client["RoomClient"]
  Server["Elysia WebSocket Server"]
  Room["RoomService"]
  Doc[("Loro CRDT Document")]
  Shared["@iris/shared Project Model"]
  Caddy["Caddy Static Server and WS Proxy"]

  Browser --> Caddy
  Caddy --> Shell
  Shell --> Tree
  Shell --> Editor
  Shell --> Preview
  Shell --> Client
  Client <-->|"JSON presence and binary updates"| Server
  Server --> Room
  Room --> Doc
  Shell --> Shared
  Shared --> Doc
  Editor -->|"local edits"| Doc
  Doc -->|"incremental updates"| Preview
  Preview -->|"runs locally in browser"| Browser
```

## Runtime Boundaries

- `apps/web` owns UI state, CodeMirror lifecycle, local WebContainer execution, and browser persistence.
- `apps/server` owns room membership, presence relay, and in-memory Loro documents. It does not execute project code.
- `packages/shared` defines the project model, settings, protocol messages, and CRDT helpers used by both sides.
- Caddy serves the built web app, proxies `/ws/*`, and supplies the cross-origin isolation headers required by WebContainer.

## Update Paths

Document updates increment the document revision and refresh files, settings, editor content, and preview inputs. Presence and connection updates use a separate revision so cursor movement does not invalidate document-derived data. Editor-local high-frequency work should remain inside CodeMirror extensions and avoid rebuilding full-document structures when the viewport or active line is unchanged.
