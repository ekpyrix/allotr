# AGENTS.md

Instructions for AI coding agents working in this repository. Humans should
read [CONTRIBUTING.md](CONTRIBUTING.md); the rules here are consistent with it.

## Project

Allotr is a self-hosted personal finance ledger with natural-language input.
Its core promise: **daily usable money comes only from on-budget accounts
minus reserved bills; savings are never included.** It is a **public
MIT-licensed repository**.

Status: design complete, implementation starting at milestone M0. Accepted
decisions are in `docs/adr/`; do not assume anything they do not cover.

## Read first

| Doc | Read it when |
|---|---|
| [docs/PRD.md](docs/PRD.md) | You need to know what a feature must do and its priority |
| [docs/architecture.md](docs/architecture.md) | You add or change a component, flow, API or config |
| [docs/domain.md](docs/domain.md) | You touch money, accounts, cycles, policies or `packages/core` |
| [docs/grammar.md](docs/grammar.md) | You touch the parser or chat commands |
| [docs/adr/](docs/adr/) | Before any hard-to-reverse choice |

## Stack

TypeScript on Node.js 24 LTS · pnpm workspaces + Turborepo · SQLite via
Kysely with forward-only SQL migrations · Hono + Zod (OpenAPI generated) ·
Better Auth · React + Vite PWA · Vercel AI SDK + MCP SDK · discord.js, grammY
· Vitest, fast-check, Playwright · ESLint strict-type-checked + Prettier ·
one Docker image with s6-overlay.

## Hard rules

These always apply. Details are in `.agent/rules/`.

1. **Everything committed is public and permanent.** No secrets, tokens,
   personal data or real financial data in code, fixtures, docs, commit
   messages, PR or issue text. Use made-up amounts, accounts and names.
   Describe prior art as patterns, not product names.
   → [.agent/rules/public-repo.md](.agent/rules/public-repo.md)
2. **Never push to `dev`, `staging` or `main`.** Branch from `dev`, open a PR.
   Feature PRs are squash-merged into `dev`; promotions use merge commits.
   → [.agent/rules/git-workflow.md](.agent/rules/git-workflow.md)
3. **Conventional Commits, signed off** (`git commit -s`) for every commit;
   Conventional Commit titles for feature PRs.
   → [.agent/rules/git-workflow.md](.agent/rules/git-workflow.md)
4. **Drafts stay out of git.** Proposals, specs, plans and scratch notes go in
   `docs/drafts/` (git-ignored). Only accepted ADRs go in `docs/adr/`.
   → [.agent/rules/design-docs.md](.agent/rules/design-docs.md)
5. **Do not read `docs/drafts/` content into public output.** Drafts may
   contain the maintainer's real data; never copy from them into tracked
   files, commits or PRs without the maintainer accepting and sanitizing it.
6. **Ledger invariants are sacred.** Integer minor units with a currency on
   every amount, append-only postings, per-currency balancing, projections as
   pure functions. AI output never commits by itself.
   → [.agent/rules/ledger.md](.agent/rules/ledger.md)
7. **Code and tests follow the house style.**
   → [.agent/rules/code-style.md](.agent/rules/code-style.md) ·
   [.agent/rules/testing.md](.agent/rules/testing.md)

## Layout

Current:

```
AGENTS.md            this file — entry point for agents
.agent/rules/        detailed rules, one topic per file
docs/                PRD, architecture, domain, grammar
docs/adr/            accepted Architecture Decision Records (public)
docs/drafts/         proposals, specs, plans, scratch (git-ignored)
packages/, apps/     workspace stubs (see target below)
scripts/             repository tooling, e.g. the dependency-direction check
.github/             issue forms, PR template, workflows, CODEOWNERS, dependabot
.gitmessage          commit message template
```

Target (created during M0), see [architecture.md §10](docs/architecture.md#10-repository-layout-target):

```
packages/core        domain, policies, invariants — pure, no I/O
packages/parser      grammar, aliases, LLM schema
packages/shared      Zod schemas, money and currency utilities
apps/server          API, auth, persistence, scheduler, AI module
apps/web             React PWA
apps/gateway         chat platform adapters (public API only)
apps/cli             import/export, backup, admin
migrations/          forward-only SQL
testdata/            golden/, eval/, synthetic/ (private/ is git-ignored)
```

Dependency direction: `apps/* → parser → core → shared`. Never import from an
app, and never give `core` I/O.

## Commands

Run `corepack enable` once for pnpm. Apps are stubs until the rest of M0 lands.

```
make dev      start server, web and gateway in watch mode
make test     unit, property, golden and integration tests
make e2e      Playwright smoke tests at phone and desktop sizes
make lint     ESLint, Prettier check, dependency direction, typecheck
make build    production build and Docker image
```

## Before you finish a task

- Diff contains no secrets, real data or product names used as comparisons
  (see the public-repo checklist).
- Work is on a feature branch, not `dev`/`staging`/`main`.
- Commits follow Conventional Commits and are signed off.
- Tests cover the change; invariant and property tests are not skipped.
- Docs (`docs/*.md`, OpenAPI) match the behaviour you changed.
- PR description follows `.github/PULL_REQUEST_TEMPLATE.md` and links an issue.
- If you made a hard-to-reverse decision, it is proposed as an ADR draft in
  `docs/drafts/` for the maintainer to accept — not committed as accepted.
