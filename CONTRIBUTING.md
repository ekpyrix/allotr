# Contributing to allotr

Thanks for your interest! allotr is a public project — please keep everything
you submit (code, test data, screenshots, issue text) free of secrets and real
financial or personal data. Use made-up amounts and accounts.

## Workflow

Branches flow one way: **feature → `dev` → `staging` → `main`**.

| Branch | Purpose | Receives changes from | Merge method |
|---|---|---|---|
| `dev` | Integration; default branch | Feature branches | **Squash** |
| `staging` | Release candidate, deployed for testing | `dev` only | **Merge commit** |
| `main` | Released code; every commit is tagged `vX.Y.Z` | `staging` only (or `hotfix/*`) | **Merge commit** |

- Branch from `dev`, named `<type>/<short-description>`, e.g. `feat/thai-numerals`.
  Keep branches short-lived (a couple of days).
- **Every PR links an issue.** Open or find one first for anything non-trivial.
- Feature PRs are squash-merged, so the **PR title becomes the commit on `dev`**
  and must follow Conventional Commits (below).
- Promotions (`dev → staging`, `staging → main`) are opened as PRs titled
  `chore(release): promote dev to staging` and use a merge commit. Never squash
  a promotion — the branches would diverge.
- **Hotfixes:** branch `hotfix/*` from `main`, PR into `main`, then merge `main`
  back into `staging` and `dev`.
- All three branches are protected: changes only through PRs, no force pushes,
  no deletion.
- **Hard-to-reverse decisions need an ADR** in `docs/adr/` — data model, ledger
  rules, API contract, storage/export formats, dependencies with lock-in.

## Development setup

You need Node.js 24 (see `.nvmrc`), pnpm through Corepack, GNU Make and git.

```sh
corepack enable          # provides the pnpm version pinned in package.json
make test                # installs dependencies on first run, then tests
make lint                # ESLint, Prettier, dependency direction, typecheck
make dev                 # watch mode
make build               # production build
make format              # apply Prettier
```

If `corepack enable` cannot write to a system directory, use
`corepack enable --install-directory ~/.local/bin pnpm`.

The workspace is a pnpm monorepo run by Turborepo. Dependencies point one way:
`apps/* → packages/parser → packages/core → packages/shared`. Apps never
import from each other, and `packages/*` never do I/O; `make lint` checks
both.

## Commit messages — Conventional Commits

```
<type>(<scope>): <subject>

<body: what and why>

Closes #123
BREAKING CHANGE: <what breaks and how to migrate>
```

| Type | Use for | Version bump |
|---|---|---|
| `feat` | New capability | minor |
| `fix` | Bug fix | patch |
| `perf`, `refactor` | Faster / restructured, no behavior change | patch / none |
| `docs`, `test`, `build`, `ci`, `chore` | Everything else | none |
| `!` or `BREAKING CHANGE:` | Incompatible change | major |

Scopes: `core`, `parser`, `api`, `web`, `discord`, `telegram`, `cli`, `deploy`,
`deps`, `adr`.

Use the repo's commit template:

```sh
git config commit.template .gitmessage
```

## Sign-off (DCO)

Every commit in a pull request must be signed off under the
[Developer Certificate of Origin](https://developercertificate.org/)
(ADR 0012). Signing off certifies that you wrote the change or otherwise have
the right to submit it under the project's MIT license. It does not transfer
any rights.

Add the sign-off with `-s`:

```sh
git commit -s -m "fix(core): round half to even"
```

This appends a trailer that must match the commit author:

```
Signed-off-by: Your Name <you@example.com>
```

A CI check fails PRs that contain unsigned commits. To fix them:

```sh
git commit --amend -s --no-edit              # last commit only
git rebase --signoff dev                     # every commit on the branch
git push --force-with-lease
```

Keep the `Signed-off-by` lines when a PR is squash-merged.

## Definition of Done

A PR is ready when:

- tests are added or updated, and ledger invariant tests are not skipped;
- docs (README, `docs/`, OpenAPI) reflect the change;
- DB migrations are forward-only and documented;
- CI is green;
- every commit is signed off (DCO);
- no secrets or real data are included anywhere.

## Reporting bugs and parse errors

Use the issue templates. For parsing problems, include the exact input text
and the expected result — these become regression test cases.

## Security

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
