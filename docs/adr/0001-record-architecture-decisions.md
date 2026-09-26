# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-09-27

## Context

allotr is a public MIT-licensed repository. Design reasoning should be visible
to contributors, but exploratory work may contain half-formed ideas or data
that does not belong in a public history.

## Decision

Record accepted architecture decisions as numbered ADRs in `docs/adr/`.
Proposed, draft and scratch design documents stay in `docs/drafts/`, which is
git-ignored, and are promoted to `docs/adr/` only once accepted and sanitized.

## Consequences

- The public history contains only settled, reviewed decisions.
- Drafts are not versioned or backed up by this repository.
- Superseded decisions remain in place, linked to the ADR that replaces them.
