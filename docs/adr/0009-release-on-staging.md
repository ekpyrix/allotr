# 0009. release-please on staging, tag on main

- Status: Accepted
- Date: 2026-09-27

## Context

ADR 0002 allows only promotion PRs from `staging` and `hotfix/*` PRs into
`main`. Versions and changelogs should come from Conventional Commits, with
a human gate. Allotr ships as one image, so one app version is enough.

## Decision

Run release-please on `staging`. Its release PR bumps the version and
CHANGELOG on `staging`, so staging tests the exact versioned build. When
`staging` is promoted to `main`, a workflow tags `vX.Y.Z` from the
version file, builds and cosign-signs the multi-arch image to GHCR, and
creates the GitHub Release. Hotfixes into `main` bump the patch version in
the hotfix PR.

## Consequences

- ADR 0002 stays unchanged.
- Tagging lives in a separate workflow from versioning, which is slightly more wiring.
- Hotfix versioning needs a documented manual step.
