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
- [0003 TypeScript on Node.js LTS for all components](0003-typescript-node-stack.md)
- [0004 SQLite with Kysely, Postgres-ready](0004-sqlite-kysely.md)
- [0005 On-budget / off-budget account model](0005-on-off-budget-model.md)
- [0006 Built-in multi-user auth with Better Auth](0006-auth.md)
- [0007 Single image, supervised server and gateway processes](0007-deployment-and-gateways.md)
- [0008 Hono with Zod schemas as the single contract source](0008-api-contract.md)
- [0009 release-please on staging, tag on main](0009-release-on-staging.md)
- [0010 Multi-currency ledger with a switchable default currency](0010-multi-currency.md)
- [0011 No telemetry; every outbound call is opt-in and disclosed](0011-no-telemetry.md)
- [0012 Contribution sign-off policy](0012-contribution-signoff.md)
- [0013 API versioning and deprecation policy](0013-api-versioning.md)
- [0014 Project name and trademark check](0014-name-and-trademark.md)
- [0015 Database encryption at rest](0015-encryption-at-rest.md)
