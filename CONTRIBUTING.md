# Contributing to Tsugite

Tsugite uses Bun, React, Elysia, CodeMirror, and Loro CRDT. Start with the [development guide](docs/development.md) for the local environment and repository layout.

## Before opening a pull request

Keep changes focused and verify the affected behavior:

- Documentation: check changed-file formatting, local links, diagrams, and examples against source and configuration.
- Pure logic: add or update focused unit tests.
- Collaboration or persistence: test real WebSocket behavior, reconnects, migration compatibility, and failure paths as appropriate.
- UI or preview: reproduce the interaction in Playwright and verify focus, keyboard behavior, and relevant screenshots.

Use the [verification commands](docs/development.md#verification) and run lint, formatting, and scoped type checks on the files you change while iterating. CI performs the full quality checks, migration checks, and web build. Playwright uses isolated servers and an in-memory database; it does not reuse development servers.

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

## Pull requests

Describe the user-visible behavior, affected runtime boundaries, verification commands and results, and any remaining limitations. Include screenshots for visual changes when useful. Identify migrations, backup requirements, protocol changes, and coordinated web/server deployment requirements before merge.

Do not describe a running or skipped check as passing. Browser CI is release/manual-only; run the affected browser workflows locally for interaction changes even when the PR workflow will skip them. Avoid bundling unrelated cleanup into a fix.

## Releases and dependencies

Release tags must match the version in `package.json`. The [release workflow](.github/workflows/release.yml) checks that match, runs quality checks, and publishes a static web archive, checksum, and provenance attestation with the GitHub Release. The archive is not a complete deployment: it does not contain the room server or database. The [Docker workflow](.github/workflows/docker-publish.yml) publishes web and server images separately; verify both jobs before deploying a tag. The browser workflow runs separately and is not a dependency of the release job.

Keep operational examples version-neutral. A release should not rewrite the deployment guide merely to replace sample version numbers. Use [the deployment guide](docs/deployment.md) for upgrade and rollback requirements, not as a release checklist.

[Renovate configuration](renovate.json) enables the Dependency Dashboard, disables automerge, and schedules updates before 05:00 on Mondays in `Asia/Shanghai`. The GitHub App also needs access to the repository; repository configuration alone does not install or trigger it. Review dependency changes through CI and validate preview-related updates in WebContainer, including the pinned starter and legacy compatibility path.
