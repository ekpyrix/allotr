# Architecture Decision Records

Only **accepted** decisions live here. Proposals, drafts and scratch notes are
kept in `docs/drafts/`, which git ignores.

## Process

1. Draft in `docs/drafts/` (any filename, status `Proposed`).
2. When the decision is made, copy `0000-template.md` to the next number here,
   set status to `Accepted`, and remove anything not fit for a public repo.
3. Never delete or rewrite an accepted ADR. To change a decision, add a new ADR
   and mark the old one `Superseded by NNNN`.

## Index

- [0001 Record architecture decisions](0001-record-architecture-decisions.md)
- [0002 Branching and promotion](0002-branching-and-promotion.md)
