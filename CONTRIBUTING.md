# Contributing to Tsugite

## Development

Tsugite uses Bun. Install dependencies with `bun install`, then run the web and
server processes with `bun run dev:web` and `bun run dev:server`.

Before opening a pull request, run:

```bash
bun run test
bun run lint
bun run format:check
bun run knip
bun run build
bun run test:e2e
```

## Commit messages

Every commit must follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>[optional scope]: <description>
```

Use one of these types:

`build`, `chore`, `ci`, `docs`, `feat`, `fix`, `license`, `meta`, `perf`,
`refactor`, `revert`, `style`, or `test`.

Examples:

```text
feat(editor): add shared selection colors
fix(room): keep the document after reconnect
ci: run Bun checks on pull requests
```

The local commit hook is installed by `bun install`. Its `pre-commit` step runs
`lint-staged` on staged source and configuration files, while `commit-msg`
enforces the commit format. Hooks can be bypassed for an intentional exception
with `git commit --no-verify`; pull requests are still checked by GitHub
Actions.

## Releases

Create and push a semantic version tag from `main`:

```bash
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

The release workflow uses git-cliff to generate notes from the commits since
the previous `v*` tag and publishes them as a GitHub Release. Renovate opens
dependency update pull requests on its weekly schedule; review and merge them
through the normal CI and commitlint checks.
