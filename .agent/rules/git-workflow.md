# Rule: git workflow

Accepted in [ADR 0002](../../docs/adr/0002-branching-and-promotion.md).

## Branches

```
feature/*  ──squash──►  dev  ──merge commit──►  staging  ──merge commit──►  main
hotfix/*   ─────────────────────────────────────────────────────────────►  main
```

| Branch | Role | Accepts | Merge method |
|---|---|---|---|
| `dev` | Default branch, integration | Feature PRs | Squash only |
| `staging` | Release candidate | Promotion PRs from `dev` | Merge commit only |
| `main` | Released, tagged `vX.Y.Z` | Promotion PRs from `staging`, `hotfix/*` | Merge commit only |

- All three are protected by GitHub rulesets: PR required, no force push, no
  deletion, no bypass. **Never push to them directly** — it will be rejected.
- Start work with `git switch dev && git pull && git switch -c <type>/<desc>`,
  e.g. `feat/thai-numerals`, `fix/cycle-rollover`, `docs/grammar`.
- Keep branches short-lived and focused on one change.
- **Never squash a promotion PR** — the long-lived branches would diverge.
- Hotfix: branch `hotfix/*` from `main`, PR into `main`, then merge `main`
  back into `staging` and `dev`.
- Do not merge PRs, promote, tag, or change repository settings unless the
  maintainer asks.

## Commit messages — Conventional Commits

```
<type>(<scope>): <subject>

<body: what and why, wrapped at 72>

Closes #123
BREAKING CHANGE: <what breaks and how to migrate>
```

- Subject: imperative, lower case, no trailing period, ≤ 72 characters.
- Types: `feat` `fix` `perf` `refactor` `docs` `test` `build` `ci` `chore` `revert`.
- Scopes: `core` `parser` `api` `web` `discord` `telegram` `cli` `deploy` `deps` `adr`.
- Breaking change: `!` after type/scope and a `BREAKING CHANGE:` footer.
- Template: `.gitmessage`.
- **Sign off every commit** with `git commit -s` (DCO,
  [ADR 0012](../../docs/adr/0012-contribution-signoff.md)). The trailer must
  match the commit author. Keep sign-offs in squash-merge messages.

## Pull requests

- Target `dev` (unless promoting or hotfixing).
- Title is a valid Conventional Commit — it becomes the squash commit on `dev`.
- Promotion PR title: `chore(release): promote dev to staging` /
  `chore(release): promote staging to main`.
- Fill in `.github/PULL_REQUEST_TEMPLATE.md`, including the Definition of Done,
  and link an issue with `Closes #N`.
