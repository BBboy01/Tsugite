# Deployment guide

## Docker Compose

The default production stack contains two services:

- `server`: Bun and the Elysia WebSocket server on internal port `3001`
- `web`: Vite's production output served by Caddy on port `80`

Build and start the stack:

```bash
docker compose up -d --build
```

Open `http://127.0.0.1:8080/room/demo`. Stop the stack with:

```bash
docker compose down
```

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

For a fork, replace `bbboy01` with its lowercase GitHub repository owner. Private images also require Docker registry authentication. Both image variables must be supplied together on subsequent Compose commands as well.

## Caddy and WebContainer

The web image uses Caddy to:

- serve `/srv`
- fall back unknown paths to `/index.html` for room routes
- proxy `/ws/*` to the `server` service
- add `Cross-Origin-Opener-Policy: same-origin`
- add `Cross-Origin-Embedder-Policy: require-corp`

Those headers are required by WebContainer. If a reverse proxy is placed in front of Caddy, preserve the headers and WebSocket upgrade requests.

## Release flow

Create a semantic version tag matching `package.json`:

```bash
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

The release workflow validates the version, runs tests, lint, formatting, build, and packaging, then publishes a GitHub Release with a tarball, checksum, and build provenance. Version-tag pushes also publish Docker images.

## Operational boundaries

- The current server stores rooms in memory. Use a persistent room store before production workloads that require recovery.
- The current deployment has no authentication or authorization. Treat room URLs as shareable capabilities.
- Each browser installs dependencies and runs a preview independently. Server CPU and memory do not include project preview processes.
