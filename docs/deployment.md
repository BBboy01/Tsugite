# Deployment guide

[Documentation home](../README.md#documentation) · [Getting started](getting-started.md) · [Architecture](architecture.md)

Run one room-server process with a persistent data volume. There is no authentication or multi-server coordination. Treat room URLs as shareable access to the project, keep deployments private when needed, and avoid putting secrets in shared files or project code.

## Docker Compose

From a repository checkout, the default stack contains two services:

- `server`: Bun and the Elysia WebSocket server on internal port `3001`
- `web`: Vite's production output served by Caddy on port `80`

Build and start the stack:

```bash
docker compose up -d --build
```

Open `http://127.0.0.1:8080/room/demo`. These instructions build the current checkout; published images may contain an older version. Check startup with:

```bash
docker compose ps
docker compose logs --tail=100 server web
```

Stop and remove the containers, while retaining the data volume:

```bash
docker compose down
```

Do not add `--volumes` or `-v` unless you intend to delete persisted rooms. The named volume is scoped to the Compose project, so changing the project name or checkout directory can select a different, empty volume. Use a stable project name for deployment and record which volume contains your data.

The host port defaults to `8080` and can be changed with `TSUGITE_PORT`:

```bash
TSUGITE_PORT=9090 docker compose up -d
```

## Published images

GitHub Actions publishes images to GitHub Container Registry on pushes to `main` and version tags:

```text
ghcr.io/<owner>/tsugite/web
ghcr.io/<owner>/tsugite/server
```

Use published images instead of local builds by setting both image variables:

```bash
TSUGITE_WEB_IMAGE=ghcr.io/bbboy01/tsugite/web:latest \
TSUGITE_SERVER_IMAGE=ghcr.io/bbboy01/tsugite/server:latest \
docker compose up -d --no-build --pull always
```

For a fork, replace `bbboy01` with its lowercase GitHub repository owner. Private images also require Docker registry authentication. `latest` follows the default branch. For repeatable deployments, choose the same published version tag or commit tag for both images and verify both publishing jobs completed; the images are not published atomically. Use the documentation from that revision.

Keep both image variables set for subsequent Compose commands as well, preferably in the deployment shell or service configuration. Changing `TSUGITE_PORT` changes only the published web port.

## Configuration

| Variable               | Consumer               | Default / behavior                                                                                                                  |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                 | Standalone room server | `3001`; the bundled Caddy proxy expects the Compose server at this port                                                             |
| `DATABASE_PATH`        | Server and Drizzle Kit | `./data/tsugite.sqlite` standalone; Compose sets `/data/tsugite.sqlite`                                                             |
| `VITE_WS_URL`          | Vite at dev/build time | Base WebSocket URL including `/ws`, without a room ID; dev defaults to the page hostname on `3001`, production to same-origin `/ws` |
| `TSUGITE_PORT`         | Compose                | Host web port, default `8080`                                                                                                       |
| `TSUGITE_WEB_IMAGE`    | Compose                | Web image, default `tsugite-web:local`                                                                                              |
| `TSUGITE_SERVER_IMAGE` | Compose                | Server image, default `tsugite-server:local`                                                                                        |

Run standalone server and migration commands from the repository root so `./drizzle` resolves correctly. Setting `DATABASE_PATH` on the host does not override Compose's explicit container path. A runtime environment variable on the Caddy container cannot change an already-built `VITE_WS_URL`; the bundled image uses same-origin proxying and normally needs no override.

## Caddy and WebContainer

The web image uses Caddy to:

- serve `/srv`
- fall back unknown paths to `/index.html` for room routes
- proxy `/ws/*` to the `server` service
- add `Cross-Origin-Opener-Policy: same-origin`
- add `Cross-Origin-Embedder-Policy: require-corp`

The bundled Caddy configuration serves plain HTTP on port `80`; it does not configure a public domain or TLS. For a remote deployment, terminate HTTPS at a reverse proxy or configure Caddy for your domain. Local loopback HTTP is suitable for development, but arbitrary remote HTTP does not provide the secure context needed by WebContainer.

Preserve both isolation headers and WebSocket upgrade requests through every proxy. The public WebSocket route is `/ws/<room-id>` and uses `wss` when the page uses HTTPS. Do not expose the backend's port directly unless your network design requires it.

The server's `/health` endpoint reports process availability, not a durable-storage check. It is internal in the bundled Compose configuration; Caddy proxies only `/ws/*`, so requesting `/health` on the web port returns the SPA rather than the server health response.

## Operational boundaries

- The server persists room documents as Loro snapshots in SQLite. Docker Compose stores the database in the `tsugite-data` volume, and `DATABASE_PATH` can override the location for standalone deployments.
- The current deployment has no authentication or authorization. Treat room URLs as shareable capabilities.
- Each browser installs dependencies and runs a preview independently. Server CPU and memory do not include project preview processes.
- Room documents, membership, timers, and pending saves are process-local. Multiple server replicas would have independent state, even if they used the same SQLite file. Horizontal scaling is not supported by this architecture.
- No room deletion or database retention policy is implemented. Idle eviction frees memory, not disk space. Monitor database and volume growth.

### Persistence and upgrades

The server runs checked-in Drizzle migrations on startup. The binary snapshot migration preserves legacy JSON data and converts each room on its next successful save. Before upgrading, stop the server cleanly and back up its complete database volume. Do not copy only the main SQLite file while it is running in WAL mode.

After binary snapshots have been written, reverting the application alone is not a safe rollback: older versions cannot read them. Restore the pre-upgrade volume together with the older image, or explicitly convert the binary rows first. Restoring a backup discards edits made after that backup.

Upgrade the web and server images together and reload already-open editors. The bounded client outbox requires the server's `update:ack` message to release pending edits; mixed frontend/backend versions are not a supported rolling-upgrade path. Acknowledgements confirm in-memory acceptance, not a durable database commit. Pending client updates live in browser memory and do not survive closing or reloading the page.

Collaboration broadcasts immediately; snapshots are coalesced on a 500 ms deadline. Last-member disconnect and SIGTERM/SIGINT trigger an immediate flush. Abrupt termination can lose recent unflushed edits; 500 ms is a normal-operation target, not a guarantee during database failures or a blocked process. Shutdown disables SQLite's per-attempt busy wait, retries persistence for up to five seconds and reports failure with a nonzero exit status. Give the container at least the default ten-second stop grace period.

### Backup and restore

Arrange a maintenance window and have collaborators finish synchronizing before stopping the stack. A database backup cannot capture edits still queued in a browser.

1. Stop web and server gracefully with `docker compose stop web server`.
2. Inspect `docker compose ps -a` and server logs. A nonzero server exit or a snapshot-save error means the latest accepted edits may not have been persisted; resolve that before treating the backup as current.
3. Copy the complete `/data` directory from the stopped server container to an unused directory outside the checkout:

   ```bash
   backup_dir="$(mktemp -d ../tsugite-backup.XXXXXX)"
   docker compose cp server:/data "$backup_dir/data"
   ```

4. Retain the web/server image references alongside the backup. Protect it as project data; do not commit it.
5. Start the stack again with `docker compose up -d`, keeping the same deployment variables and project name.

For standalone deployments, stop the server cleanly and copy the database together with any remaining `-wal` and `-shm` sidecars. Do not copy a live WAL database as a single file.

To restore, stop the deployment, preserve the current volume as a separate backup, and restore the complete saved directory into an empty replacement data volume. Start the matching web/server versions against that volume, verify room content, then reopen access. Do not overlay an older database onto a directory with unrelated WAL files. Restoring an earlier backup intentionally discards later edits, so confirm the recovery point before proceeding.

### Resource limits

The server currently uses these per-process defaults:

| Resource                              | Limit                                              |
| ------------------------------------- | -------------------------------------------------- |
| Room identifier                       | 1-80 ASCII letters, digits, underscores or hyphens |
| Inbound WebSocket frame / CRDT update | 1 MiB                                              |
| Open connections / joined clients     | 256                                                |
| Members in one room                   | 64                                                 |
| Resident room documents               | 128                                                |
| New rooms                             | 20 per minute                                      |
| Messages per connection               | 120 per second                                     |
| Time to send a valid join             | 10 seconds                                         |
| Empty-room memory retention           | 5 minutes                                          |

Limits reject excess traffic rather than delete projects. Reopening a persisted room does not consume the new-room quota. These bounds reduce accidental or abusive resource use; they do not provide authentication, per-user isolation, a total database-size quota or a strict per-document memory bound. For an internet-facing deployment, also monitor disk growth and apply ingress-level protection.

A local edit whose encoded update exceeds 1 MiB stops synchronization for that tab instead of repeatedly reconnecting. The offline indicator exposes the reason; the edit and subsequent changes remain local. Copy those changes before reloading or closing the tab, then reapply them in smaller edits. This limit applies to an individual encoded update, not the total project size.

The limits are code defaults, not environment-variable settings. See [room-limits.ts](../apps/server/src/rooms/room-limits.ts) and [room-app.ts](../apps/server/src/room-app.ts) for their enforcement.

## Operational checks

| Symptom                          | Next check                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page loads but rooms reconnect   | Check server logs, `/ws/<room-id>` upgrades, matching web/server versions, and admission limits.                                                                 |
| Rooms appear empty after restart | Confirm the Compose project name, mounted volume, and `DATABASE_PATH` before creating or overwriting data.                                                       |
| Migration fails                  | Stop retrying the upgrade, retain the database, and inspect migration logs and the pre-upgrade backup. Do not delete migration history.                          |
| Snapshot save fails              | Check disk space, permissions, and competing SQLite writers. Pending state remains in memory and idle eviction is deferred.                                      |
| Preview unavailable              | Check HTTPS, isolation headers, browser storage support, and the browser-local Output panel. Restarting the room server does not reinstall browser dependencies. |

After an upgrade, check a known room, join it with two independent browser identities, edit a file, and verify preview startup. Test backup restoration separately; a healthy process and a live WebSocket do not prove a usable backup.
