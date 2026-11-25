# Contributing to Tsugite

Tsugite uses Bun, React, Elysia, CodeMirror, and Loro CRDT. Start with the [development guide](docs/development.md) for the local environment and repository layout.

## Before opening a pull request

Keep changes focused and verify the affected behavior:

- Documentation: check changed-file formatting, local links, diagrams, and examples against source and configuration.
- Pure logic: add or update focused unit tests.
- Collaboration or persistence: test real WebSocket behavior, reconnects, migration compatibility, and failure paths as appropriate.
- UI or preview: reproduce the interaction in Playwright and verify focus, keyboard behavior, and relevant screenshots.

Use the [testing guide](docs/testing.md) to select checks, and run lint, formatting, and scoped type checks on the files you change while iterating. CI performs the full quality checks, migration checks, and web build. Playwright uses isolated servers and an in-memory database; it does not reuse development servers.

Preserve existing worktree changes. Do not commit credentials, runtime databases, dependency installations, or test artifacts. Keep generated Drizzle migrations and `bun.lock` when their corresponding inputs change. Bug fixes should include a regression that fails before the fix and passes after it.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>[optional scope]: <description>
```

Allowed types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `license`, `meta`, `perf`, `refactor`, `revert`, `style`, and `test`.

Examples:

```text
feat(editor): add shared selection colors
fix(room): preserve the document after reconnect
docs: clarify Docker deployment
```

Commit headers, including type and scope, are limited to 100 characters by [commitlint](commitlint.config.mjs). `bun install` installs local hooks: pre-commit runs staged-file lint/format checks followed by the project typecheck; commit-msg validates the message. The hook's full typecheck is separate from scoped checks during iteration. Do not bypass a failing hook without explaining and resolving the failure or an explicitly agreed exception.

Markdown is included in the staged-file formatting patterns and the root `format:check` script. Check changed documentation explicitly while iterating as described in [documentation checks](docs/testing.md#documentation-checks).

## Pull requests

Describe the user-visible behavior, affected runtime boundaries, verification commands and results, and any remaining limitations. Include screenshots for visual changes when useful. Identify migrations, backup requirements, protocol changes, and coordinated web/server deployment requirements before merge.

Do not describe a running or skipped check as passing. Run the affected browser workflows locally for interaction changes; [browser CI](docs/testing.md#browser-ci) does not run for ordinary PRs. Avoid bundling unrelated cleanup into a fix.

## Documentation changes

Keep user procedures in [Getting started](docs/getting-started.md), setup and migration work in [Development](docs/development.md), check commands and benchmark interpretation in [Testing](docs/testing.md), and operations in [Deployment](docs/deployment.md). [Architecture](docs/architecture.md) owns runtime and state boundaries; [TypeScript intelligence](docs/typescript-intelligence.md) owns the language-service contract and budgets. Update the README index when adding a guide.

Verify facts against the implementation: scripts in `package.json`, test projects in `playwright.config.ts`, triggers in `.github/workflows/`, deployment settings in Compose/Caddy/Dockerfiles, and limits beside their enforcing code. Link to those sources rather than copying long inventories into several guides. Distinguish browser-local state, shared room state, server acknowledgement, and durable storage in examples and recovery instructions.

## Releases and dependencies

The root `package.json` owns the application release version and the version
displayed in the header. Private workspace package versions are independent.

The root `minimatch` override fixes GHSA-g3hv-75wg-m249 in the shadcn development
toolchain. Remove it once shadcn's transitive dependency range selects a patched
version; verify the CLI and TypeScript project file matching when changing it.

Release tags must match the version in `package.json`. The [release workflow](.github/workflows/release.yml) checks that match, runs quality checks and the isolated Linux AMD64 standalone server suite, and attaches two archives with individual checksums: static web output and the standalone room server with its `drizzle/` migrations. It records GitHub build provenance attestations for both archives; these are not separate Release attachments. The web archive needs a matching server, and neither archive contains a database. See [standalone deployment](docs/deployment.md#standalone-executable) for platform requirements. The [Docker workflow](.github/workflows/docker-publish.yml) publishes web and server images separately; verify both jobs before deploying a tag. [Browser CI](docs/testing.md#browser-ci) runs separately and is not a dependency of the release job.

Keep operational examples version-neutral. A release should not rewrite the deployment guide merely to replace sample version numbers. Use [the deployment guide](docs/deployment.md) for upgrade and rollback requirements, not as a release checklist.

[Renovate configuration](renovate.json) enables the Dependency Dashboard, disables automerge, and schedules updates before 05:00 on Mondays in `Asia/Shanghai`. The GitHub App also needs access to the repository; repository configuration alone does not install or trigger it. Review dependency changes through CI and validate preview-related updates in WebContainer, including the pinned starter and legacy compatibility path.
