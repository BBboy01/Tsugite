# Contributing to Tsugite

Tsugite uses Bun, React, Elysia, CodeMirror, and Loro CRDT. Start with the [development guide](docs/development.md) for the local environment and repository layout.

## Before opening a pull request

Run the checks relevant to the change. The available quality checks are:

```bash
bun run test
bun run lint
bun run format:check
bun run knip
bun run build
bun run test:e2e
```

Use focused checks while iterating. For documentation-only changes, check formatting, links, and accuracy against the implementation. For application changes, include the relevant unit and browser tests. Playwright automatically starts the web and server processes, or reuses running local instances.

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

`bun install` installs local hooks. The pre-commit hook runs staged-file checks and the commit-msg hook validates the commit subject. Use `--no-verify` only for an intentional, documented exception.

## Pull requests

Keep a pull request focused and describe the user-visible behavior, affected runtime boundaries, and verification performed. Include a regression test for bug fixes and screenshots or recordings for visual changes when useful.

## Releases and dependencies

Release tags must match the version in `package.json`:

```bash
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

The release workflow validates the tag, runs tests and build checks, publishes the web artifact, and creates a GitHub Release. Renovate opens dependency update pull requests on its configured schedule; review them through the normal CI and commitlint checks.
