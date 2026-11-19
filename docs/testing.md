# Testing guide

[Documentation home](../README.md#documentation) · [Development](development.md) · [Architecture](architecture.md) · [Contributing](../CONTRIBUTING.md)

Run commands from the repository root with locked dependencies installed. A passing unit test, controlled browser fixture, real preview, and deployed application establish different things.

## Choose checks

| Change                                         | Verification                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Documentation                                  | Changed-file Markdown formatting, links, anchors, examples, and source/configuration comparison |
| Pure transformations or state                  | Focused adjacent Bun tests and changed-file static checks                                       |
| Collaboration, protocol, or persistence        | Shared and affected client/server tests; real WebSocket reconnect and failure paths             |
| Schema or migrations                           | Drizzle validation and a disposable database; legacy snapshot compatibility                     |
| Editor, dialogs, tabs, settings, or navigation | Affected Playwright files, keyboard/focus behavior, relevant screenshots and narrow layouts     |
| Preview lifecycle or package changes           | Focused runtime tests plus real WebContainer startup/recovery in the `preview` project          |
| Language services                              | Worker unit tests, browser recovery/declaration tests, and relevant benchmarks                  |

Use [focused static checks](development.md#verification) while iterating. Bug fixes should have a regression that fails before the fix and passes after it. Report unavailable capabilities, skipped tests, pending CI, and controlled dependencies as such.

## Documentation checks

The root formatting scripts and [staged-file patterns](../lint-staged.config.mjs) exclude Markdown. Pass changed documents explicitly:

```bash
bun --no-env-file x --no-install oxfmt --check README.md docs/testing.md
git diff --check
```

Use `oxfmt --write` with the same changed paths to fix formatting. Check relative links, heading anchors, image paths, and fenced examples. Compare commands, defaults, limits, and CI descriptions with their enforcing source files. Inspect Mermaid diagrams and rendered tables when their structure changes. Keep diagnostic reports, generated test artifacts, databases, and dependency installations outside committed documentation.

## Browser tests

Playwright starts its own in-memory server on `3003` and Vite on `5175`. It does not reuse running servers or load environment files. Keep those ports free. Development servers on `3001` / `5173` can stay running. The test server raises room capacity and shortens idle retention to accommodate independent cases; production defaults are unchanged.

Use unique, valid room IDs. Create separate browser contexts for collaborators so they do not share local-storage identities. Keep real WebContainer startup and recovery scenarios in `e2e/preview.spec.ts`: the `preview` project runs with one worker. The ordinary `ui` project uses two workers locally; main-branch CI runs the smaller one-worker `smoke` project plus the tagged preview smoke test, while release candidates, version tags, and manual runs execute the complete suite with one worker because the CI runner is resource constrained.

| Project   | Scope                                                                                           | Dependencies                               |
| --------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `ui`      | All specs except `preview.spec.ts`, including controlled preview fixtures and Worker benchmarks | None                                       |
| `preview` | Real WebContainer cases in `preview.spec.ts`                                                    | `ui`                                       |
| `smoke`   | Selected core room, editing, collaboration, settings, draft, and Vim specs                      | None; exists only with `E2E_PROFILE=smoke` |

Install the browser once, then run the relevant project or file:

```bash
bun --no-env-file x --no-install playwright install chromium
bun --no-env-file x --no-install playwright test --project=ui
bun --no-env-file x --no-install playwright test e2e/dialog-escape.spec.ts --project=ui --workers=1 --reporter=line
bun --no-env-file x --no-install playwright test --project=preview --no-deps
```

`--no-deps` is for an isolated preview run, not proof that UI checks passed. A normal `bun run test:e2e` runs both projects in dependency order. A failed UI project prevents its dependent preview project from running.

If a test port is occupied, set both server and web ports explicitly:

```bash
E2E_SERVER_PORT=3013 E2E_WEB_PORT=5185 bun --no-env-file x --no-install playwright test e2e/room.spec.ts --project=ui --workers=1
```

For application navigation, prefer `domcontentloaded` plus bounded waits for the expected state; ongoing WebContainer activity can prevent `networkidle`. A `ui` run alone does not verify real WebContainer startup.

### Browser CI

The [Browser E2E workflow](../.github/workflows/e2e.yml) selects its suite by event:

| Event                                                                         | Browser coverage                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Push to `main`                                                                | `smoke` project, then real `preview` tests tagged `@smoke` with `--no-deps` |
| Version tag matching `v*.*.*`                                                 | Full default suite                                                          |
| Manual `workflow_dispatch`                                                    | Full default suite                                                          |
| PR with `release` label, `chore(release):` title, or `release/` source branch | Full default suite                                                          |
| Ordinary PR                                                                   | Browser job skipped                                                         |

CI uses one worker, up to two retries, and a 60-minute browser job timeout. PR events are `opened`, `synchronize`, `reopened`, and `labeled`; changing only a PR title does not itself trigger the workflow. Read the workflow for the exact condition.

Other automation has separate responsibilities:

| Workflow                                                        | What it establishes                                                                                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Quality CI](../.github/workflows/ci.yml)                       | Frozen install, migration consistency and fresh-database application, unit/integration tests with LCOV, lint/typecheck, configured formatting, advisory Knip, web build |
| [Spelling](../.github/workflows/spelling.yml)                   | Typos against the repository configuration                                                                                                                              |
| [Dependency Review](../.github/workflows/dependency-review.yml) | PR dependency vulnerability review, failing at high severity                                                                                                            |
| [CodeQL](../.github/workflows/codeql.yml)                       | JavaScript/TypeScript static security analysis                                                                                                                          |
| [Commitlint](../.github/workflows/commitlint.yml)               | Commit-message conventions                                                                                                                                              |
| [Release](../.github/workflows/release.yml)                     | Matching tag/package version, quality checks, static archive, checksum, provenance, and release notes                                                                   |
| [Docker images](../.github/workflows/docker-publish.yml)        | Separate web/server image builds; publishing on main/tags, build-only for selected Docker-related PR changes                                                            |

Quality CI runs on main pushes, PRs, and merge groups. Knip is advisory (`--no-exit-code`). Codecov upload failures fail the quality job; [coverage statuses](../codecov.yml) are informational with no configured percentage threshold. Root formatting and staged-file hooks do not cover Markdown. Release and Docker publishing jobs do not depend on Browser E2E; their success does not establish that browser checks passed.

Inspect Playwright's retained trace, screenshot, and video on failure. Report the failing step and distinguish application regressions from unavailable browser capabilities or dependency downloads. Keep diagnostic artifacts out of source control, and do not replace failing assertions with retries or skips without a cause.

## Editor performance checks

Run the editor and file-tree benchmarks with one worker to avoid competing browser workloads:

```bash
bun --no-env-file x --no-install playwright test e2e/editor-performance.spec.ts e2e/file-tree-performance.spec.ts --project=ui --workers=1 --reporter=line --output=/tmp/tsugite-performance
```

The editor benchmark mounts the real workspace through a test-only React Profiler entry. It compares 500 and 10,000 lines of TypeScript, types at the end of the document, and verifies that edits reach the CRDT document. It also checks bounded CodeMirror DOM rows and page-scroll containment at desktop and narrow widths. WebSocket delivery and WebContainer execution are controlled fixtures; this is not a server-throughput or real-preview benchmark.

The attached `editor-benchmark.json` records first-highlight time, workspace-subtree commit counts, React render durations, and the interval from `beforeinput` to the next animation frame. First-highlight time starts at navigation's app initialization and ends when the editor marks its first successful Highlights result; the input interval is a responsiveness proxy, not a paint measurement or INP. `editor-typing.cpuprofile` can be opened in Chrome DevTools to identify CPU hotspots. The tests retain StrictMode and development instrumentation, so compare runs under the same browser, viewport, source, and worker count; do not treat absolute timings as production budgets. Timing samples are reported, while assertions enforce functional and DOM-size invariants.

When preparing large fixtures, insert the source directly into an empty Loro text instead of calling `update` on unrelated content. The latter computes a text diff and can dominate test setup before the browser starts. Keep all profiler hooks in `e2e/`; the normal application entry does not import them.

The benchmark intercepts both plain and cache-busted Vite entry URLs and asserts that the profiler has recorded a commit before collecting input samples. Otherwise, a `main.tsx?t=...` entry can bypass the harness while normal editing still works, producing an invalid zero-sample result. It also waits for worker highlighting before typing so an unloaded highlighter cannot make a run appear faster.

The file-tree benchmark compares the starter with a room containing 5,000 generated files. It records mount time and rendered row counts in `file-tree-benchmark.json`, then scrolls to verify virtualized rows remain bounded. WebSocket messages use controlled snapshots; it does not measure database reads or network throughput.

The benchmark also selects the final declaration with Go to definition and records `editor-first-definition.json`. This measures the command click through the verified browser selection, including automation and rendering overhead, not isolated compiler CPU time. These controlled fixtures do not measure a real WebContainer preview or establish a budget for arbitrary projects.

`preview-preflight.spec.ts` uses the browser clock and the real Babel validator to assert that a burst produces only one validation, cancelled module loads do not parse, and runtime progress remains visible while the debounce is pending. Only the external container runtime is replaced in those cases; `preview.spec.ts` owns real WebContainer startup and recovery verification.

### TypeScript Worker checks

[typescript-import-index.spec.ts](../e2e/typescript-import-index.spec.ts) exercises a code-dense 512-file / 16 MiB workspace in Chromium. It verifies event-loop yielding and records cold indexing, unchanged-cache and single-file-edit timings separately. The eight-millisecond slice is checked between files, not a preemption deadline for an individual file.

[typescript-worker-benchmark.spec.ts](../e2e/typescript-worker-benchmark.spec.ts) creates the actual production Worker through Vite on an isolated page. It checks official Promise and DOM types, installed React/JSX declarations, package `types` entries, diagnostics, and completion at 3, 128, and 512 source files. Each workspace records 30 samples per query both unchanged and after source edits, verifies that all queries succeed, and disposes its Worker.

Run the focused language-service suites and benchmark from the repository root:

```bash
bun --no-env-file test apps/web/src/lib/typescript-intelligence.test.ts apps/web/src/lib/typescript-worker-client.test.ts apps/web/src/lib/typescript-worker-session.test.ts apps/web/src/lib/typescript-standard-library.test.ts apps/web/src/lib/typescript-declarations.test.ts apps/web/src/lib/webcontainer-declaration-scan.test.ts apps/web/src/lib/webcontainer-declarations.test.ts apps/web/src/lib/room-typescript-intelligence.test.ts apps/web/src/lib/preview-typescript-declarations.test.ts
bun --no-env-file x --no-install playwright test e2e/editor-language-loading.spec.ts e2e/editor-context-menu.spec.ts e2e/typescript-worker-recovery.spec.ts e2e/typescript-declaration-status.spec.ts --project=ui --workers=1 --reporter=line
bun --no-env-file x --no-install playwright test e2e/typescript-import-index.spec.ts e2e/typescript-worker-benchmark.spec.ts e2e/typescript-worker-project.spec.ts e2e/typescript-worker-input.spec.ts --project=ui --workers=1 --reporter=line --output=/tmp/tsugite-typescript-worker
```

The attached `typescript-worker-benchmark` JSON reports constructor-to-first-hover startup time, publish and query p50/p95, main-thread long tasks, a 16 ms timer heartbeat, and the Dedicated Worker's CDP V8 heap (`usedSize`, `totalSize`, `embedderHeapUsedSize`, and `backingStorageSize`). It also measures 10 hover, completion, and diagnostic queries with a legal maximum workspace of 512 source files / 16 MiB plus 1,024 declarations / 8 MiB; the separate worker-project suite checks exact-limit rejection and recovery. The Worker is measured while alive and the page target heap is recorded separately. Startup includes Worker/compiler loading and standard-library assets. The heartbeat is an event-loop responsiveness proxy, not paint or INP. These browser-specific heap values are a repeatable local comparison, not total process memory or proof of a memory-leak conclusion. Maximum-budget fixture padding does not model pathological type complexity or every real project dependency graph.

These suites measure Chromium against Vite's development server, with potentially warm Vite and browser caches. They do not establish production cold-start or bundle-size results. The isolated benchmark does not exercise rendered UI, collaboration, or real WebContainer installation; the editor and preview suites own those boundaries. Re-run focused failure tests and the benchmark after compiler, declaration-loader, or Worker lifecycle changes. Replacing the engine with TypeScript 7 must satisfy the [engine replacement gate](typescript-intelligence.md#replacement-gate), independently of the tooling compiler version.

The [real-input suite](../e2e/typescript-worker-input.spec.ts) mounts the production AppShell, CodeMirror, room owner, and Worker. It checks five rounds of 24 input events under concurrent hover, completion, and diagnostics, confirms a successful reply from each method during every round, verifies Loro delivery and definition navigation, and records input-to-frame latency and main-thread long tasks. It runs both a representative workspace and 512 source files / 16 MiB minus 4 KiB of typing reserve plus 1,024 declarations / 8 MiB. WebSocket delivery and declaration reads are controlled fixtures; this does not validate actual dependency installation. The real WebContainer preview suite owns that boundary.

The benchmarks report startup, query p50/p95, main-thread long tasks, input-to-frame intervals, heartbeat jitter, Worker heap, and lifecycle counts. The Worker query suite enforces a coarse two-second p95 limit for its fixtures; this is not a production latency target. Other timing and heap samples are observations, while assertions enforce successful queries, cleanup, and functional invariants. Lifecycle counts cover controlled readiness, retry, and unavailable cases, not a production fault rate. Compare measurements under matching conditions and record production cold-start and fault-rate observations separately after deployment.
