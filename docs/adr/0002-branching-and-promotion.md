# 0002. Branching and promotion: dev → staging → main

- Status: Accepted
- Date: 2026-09-27

## Context

allotr is self-hosted and handles money. Changes should be exercised in a
staging deployment before they reach released code.

## Decision

- Three long-lived, protected branches: `dev` (default, integration),
  `staging` (release candidate), `main` (released, tagged).
- Feature branches are squash-merged into `dev`; PR titles follow
  Conventional Commits.
- Promotions `dev → staging → main` are PRs merged with a merge commit.
- Hotfixes branch from `main` and are merged back down to `staging` and `dev`.

## Consequences

- `main` only ever contains code that passed through staging.
- Promotions must not be squashed, or the branches diverge.
- More ceremony than trunk-based development; revisit if it slows a
  single-maintainer workflow.
