# Allotr — Architecture

How Allotr fits together. What it must do is in the [PRD](PRD.md); the ledger
rules are in [domain.md](domain.md); the reasons for each choice are in the
[ADRs](adr/).

## 1. System overview

```
┌──────────────────────── allotr image (s6-overlay) ────────────────────────┐
│ ┌──────────────── server (always) ────────────────────────────────────┐   │
│ │ core (pure) · API (Hono) · web app (static SPA) · grammar parser    │   │
│ │ auth (Better Auth) · scheduler · Kysely → SQLite                    │   │
│ │ ┌─ AI module (off unless enabled) ───────────────────────────────┐  │   │
│ │ │ LLM fallback · assistant · MCP endpoint /mcp                   │  │   │
│ │ └────────────────────────────────────────────────────────────────┘  │   │
│ └───────────────────────────▲─────────────────────────────────────────┘   │
│                             │ public HTTP API + per-install secret        │
│ ┌───────────────────────────┴──────────────┐                              │
│ │ gateway (idle until a platform is set)   │  Discord · Telegram · …      │
│ └──────────────────────────────────────────┘                              │
└───────────────────────────────────────────────────────────────────────────┘
  optional: local LLM container          optional: ALLOTR_ROLE split
```

- **One image**, amd64 and arm64. s6-overlay supervises the `server` and
  `gateway` processes and restarts them on crash ([ADR 0007](adr/0007-deployment-and-gateways.md)).
- **The server is the only writer** to the database.
- **Gateways are thin.** One gateway process hosts every enabled chat
  platform and talks to the server only through the public API.
- **AI is a module inside the server**, disabled by default. A local model,
  if used, runs in its own container.
- `ALLOTR_ROLE=server|gateway` runs a single role for split deployments;
  the default `all` runs both. The image runs as uid 1000 and keeps its
  database and backups in the `/data` volume (`deploy/docker-compose.yml`).

## 2. Components

| Package / app | Responsibility | Rules |
|---|---|---|
| `packages/core` | Domain types, ledger, projections, policy strategies, invariants | Pure TypeScript, **no I/O**. Fully unit- and property-tested |
| `packages/parser` | Command grammar, alias resolution, LLM prompt and output schema | Depends on `core` and `shared` only |
| `packages/shared` | Zod schemas, money and currency utilities, ISO 4217 table | Single source for HTTP, OpenAPI, MCP and LLM schemas |
| `apps/server` | HTTP API, auth, persistence, scheduler, AI module, serves the web build | Only component with database access |
| `apps/gateway` | Platform adapters (Discord, Telegram, …) | Uses the public API only; no database, no domain logic |
| `apps/web` | React SPA/PWA | Talks to the API; no business rules beyond display |
| `apps/cli` | Import/export, backup/restore, admin, stdio MCP bridge | Uses the API or `core` + database through the server's modules |

Dependency direction: `apps/* → packages/parser → packages/core →
packages/shared`. Nothing depends on an app.

## 3. Technology stack

| Concern | Choice | ADR |
|---|---|---|
| Language / runtime | TypeScript, Node.js 24 LTS | [0003](adr/0003-typescript-node-stack.md) |
| Database | SQLite (WAL, STRICT tables), Postgres-ready | [0004](adr/0004-sqlite-kysely.md) |
| Query layer | Kysely, forward-only `.sql` migrations, generated types | [0004](adr/0004-sqlite-kysely.md) |
| API | Hono, Zod schemas → OpenAPI 3.1, SSE | [0008](adr/0008-api-contract.md) |
| Auth | Better Auth: local accounts, TOTP, OIDC, API tokens | [0006](adr/0006-auth.md) |
| Web | React + Vite, TanStack Router/Query, shadcn/ui, Tailwind tokens, PWA | — |
| Charts / motion | Recharts plus custom SVG; CSS and View Transitions plus Motion | — |
| AI | Vercel AI SDK (OpenAI-compatible default), MCP TypeScript SDK | [0008](adr/0008-api-contract.md) |
| Chat | discord.js, grammY | [0007](adr/0007-deployment-and-gateways.md) |
| Monorepo | pnpm workspaces + Turborepo | [0003](adr/0003-typescript-node-stack.md) |
| Quality | ESLint strict-type-checked, Prettier, Vitest, fast-check, Playwright | [0003](adr/0003-typescript-node-stack.md) |
| Process supervision | s6-overlay | [0007](adr/0007-deployment-and-gateways.md) |
| Release | release-please on `staging`, tag on `main` | [0009](adr/0009-release-on-staging.md) |

## 4. Request flows

### 4.1 Chat message

```
chat message ─► gateway ─► POST /v1/messages {identity, platform_msg_id, text, ts}
  ─► intake: linked identity → user · idempotency on platform_msg_id · store raw text
  ─► parser, per line:
       grammar.parse ── ok ──► Proposal(source=grammar)
                    └─ fail ─► AI on?  llm.parse(line, minimal context) ─► Proposal(source=llm)
                               AI off? reply with grammar help
  ─► validate against core rules
  ─► source=grammar ? commit : reply with [Confirm] [Edit] [Cancel]
  ─► commit ─► ledger append ─► event ─► SSE ─► open dashboards refresh
  ─► reply: receipt + left today + live daily
```

### 4.2 Web quick entry

The web app sends the typed line to the same parser endpoint, shows the
result as editable fields, and posts a structured transaction on save.
Offline entries are queued in the browser with client-generated idempotency
keys and sent when the connection returns.

### 4.3 Assistant and MCP

The assistant (web panel and chat) and external MCP clients use one tool set:
`get_today`, `query_report`, `list_transactions`, `simulate`,
`propose_transaction`, and, with write scope, `add_transaction`, `transfer`,
`reconcile`, `reverse`. Figures always come from fresh tool calls, never from
conversation memory. Changes are proposals unless the token has `write`
scope. See [domain.md § AI boundaries](domain.md#ai-boundaries).

## 5. API

- REST under `/v1`, JSON, OpenAPI 3.1 generated at `/openapi.json`.
- Errors use RFC 9457 problem details, with a stable `code` member where a
  client may act on the error.
- Authentication ([ADR 0006](adr/0006-auth.md)) is Better Auth under
  `/v1/auth` (sign-in, TOTP 2FA, session list and revoke). Onboarding
  (`/v1/onboarding`, first user becomes admin), single-use invites
  (`/v1/invites`), the current session (`/v1/session`) and instance settings
  (`/v1/admin/settings`: registration mode, required 2FA) are Allotr routes.
- The ledger is served under `/v1/accounts`, `/v1/categories`, `/v1/tags`
  and `/v1/transactions`. Undo (`POST /v1/transactions/{id}/reverse`) and
  edit (`…/edit`) only append entries. An `Idempotency-Key` header on
  `POST /v1/transactions` makes a repeat return the entry it first created
  (200) instead of recording another, as offline queues need. Every query is scoped to the signed-in user, and another
  user's rows answer 404. Domain errors from `core` and `shared` become
  problem details whose `code` is the error code without its namespace
  (`ledger.unbalanced` → `unbalanced`).
- `GET /v1/today` returns the daily figures (left today, today's allowance,
  live daily, days left, cycle end, the overdue flag and currencies left out
  for lack of a rate), computed from the ledger on every request.
  `/v1/settings/ledger` holds the locale, time zone, default currency, payday
  day (the 1st until set) and payday override; switching the default currency
  changes figures, never entries. `/v1/rates` takes manual exchange rates, one
  per pair and day. `/v1/bills` is the minimal bill list the reserve needs;
  `POST /v1/bills/{id}/payments` marks a due date paid and `DELETE
  …/payments/{dueOn}` undoes the mark.
- `POST /v1/import` fills an empty ledger from a JSON bundle (see
  [§5.1](#51-import-bundle)): validated as a whole, then applied in one
  database transaction through the same writes as the API. A ledger that
  already has accounts, entries, bills or rates is refused
  (`ledger_not_empty`).
- Cookie-authenticated writes must carry the instance's `Origin`. Password
  sign-ins lock an account for 15 minutes after 5 failures, and sign-in and
  2FA attempts are limited per client address. `ALLOTR_TRUSTED_PROXIES`
  decides when `X-Forwarded-For` is believed.
- Live updates via Server-Sent Events at `/v1/events`.
- MCP at `/mcp` (Streamable HTTP, bearer token).
- Versioning: additive changes only within `/v1`; breaking changes get a new
  major that runs alongside the old one for at least two minor releases
  ([ADR 0013](adr/0013-api-versioning.md)).

### 5.1 Import bundle

The native import format, version 1 (`bundleSchema` in `packages/shared`).
Items refer to each other by name: account names, category paths (`"Fun"`,
`"Food/Coffee"`) and tag names, all compared without case. A category that
matches an existing one by name and parent is reused; the rest are created.
Transactions need `occurredOn`; an account without `openedOn` opens on the
earliest entry day. A transaction `ref` lets a bill payment link to it.
Unknown fields are refused. Other apps' exports are converted to this
bundle rather than imported directly.

```json
{
  "format": "allotr.bundle",
  "version": 1,
  "settings": { "timeZone": "UTC", "defaultCurrency": "EUR", "paydayDay": 25 },
  "categories": [{ "name": "Coffee", "parent": "Food" }],
  "accounts": [
    {
      "name": "Wallet",
      "currency": "EUR",
      "openingBalance": { "amountMinor": 12000, "currency": "EUR" }
    }
  ],
  "rates": [{ "base": "USD", "quote": "EUR", "rate": "0.92", "asOf": "2026-03-01" }],
  "transactions": [
    {
      "kind": "expense",
      "ref": "coffee-1",
      "account": "Wallet",
      "amount": { "amountMinor": 350, "currency": "EUR" },
      "category": "Food/Coffee",
      "occurredOn": "2026-03-02",
      "tags": ["morning"]
    }
  ],
  "bills": [
    {
      "name": "Phone",
      "account": "Wallet",
      "amount": { "amountMinor": 2500, "currency": "EUR" },
      "dueDay": 22,
      "payments": [{ "dueOn": "2026-03-22", "paidOn": "2026-03-21" }]
    }
  ]
}
```

Errors are problem details whose `errors[].path` is a JSON Pointer into the
bundle: `invalid_bundle`, `unsupported_bundle_version`, `invalid_reference`
(all collected, at most 100), or the refused item's usual code while
applying. Limits: 10 MB, 50,000 transactions, 1,000 of each other list.
The import holds the database's write lock while it runs, roughly a second
per thousand transactions, so a bundle near the limit takes tens of seconds;
allow for that in a reverse proxy's timeout.

## 6. Data

- One SQLite file per instance; every user-owned row carries `user_id`.
- Money: integer minor units plus an ISO 4217 code on every posting
  ([ADR 0010](adr/0010-multi-currency.md)).
- The ledger (`transactions`, `postings`) is append-only. Balances, cycles and
  reports are projections computed from it.
- Migrations are forward-only SQL files, run at startup behind a lock after an
  automatic backup.
- The logical model is described in [domain.md](domain.md#data-model).

## 7. Configuration

| Source | Holds |
|---|---|
| Environment / Docker secrets | Bootstrap and secrets only: `ALLOTR_DATABASE_PATH`, `ALLOTR_BASE_URL`, `ALLOTR_SECRET_KEY`, `ALLOTR_HOST`, `ALLOTR_PORT`, `ALLOTR_LOG_LEVEL`, `ALLOTR_TRUSTED_PROXIES`, `ALLOTR_ROLE` (documented in `.env.example` and `deploy/.env.example`) |
| Admin UI (stored in the database) | Everything else: gateways, AI, exchange rates, OIDC, registration, notifications |
| Per-user settings | Policies, defaults, locale, timezone, currency, themes |

An environment variable can pre-seed or lock a UI setting ("managed by
environment") for users who manage configuration in git.

## 8. Scheduled jobs

Digests, reminders, recurring posts, rollover prompts, exchange-rate fetches,
backups and retention purges. Jobs are idempotent and keyed by
(job, user, period) in the user's timezone. After downtime each missed period
runs once; digests older than 24 hours are skipped. Correctness never depends
on a job running, because figures are derived from the ledger.

## 9. Security and privacy

See [SECURITY.md](../SECURITY.md) for the threat model. Architectural rules:

- All user-supplied URLs go through one SSRF-safe HTTP client.
- No telemetry; every outbound call is opt-in and listed
  ([ADR 0011](adr/0011-no-telemetry.md)).
- AI output is untrusted input: schema-validated and never committed without
  the rules in [domain.md](domain.md#ai-boundaries).

## 10. Repository layout (target)

```
allotr/
├─ packages/  core/  parser/  shared/
├─ apps/      server/  web/  gateway/  cli/
├─ migrations/                 forward-only SQL
├─ testdata/  golden/  eval/  synthetic/   (private/ is git-ignored)
├─ deploy/    docker-compose.yml  .env.example  s6/
├─ docs/      PRD.md  architecture.md  domain.md  grammar.md  adr/
└─ .github/   workflows/  ISSUE_TEMPLATE/
```

## 11. Testing

| Layer | What | Tool |
|---|---|---|
| Unit | Money, dates, daily calculation, policies | Vitest |
| Property | Random transaction sequences never break invariants | fast-check |
| Golden | Grammar input → expected JSON | Vitest file snapshots |
| Integration | API + SQLite + migrations | Vitest |
| End-to-end replay | Synthetic month imported → expected balances | CLI + fixtures |
| UI | Key views at phone, tablet, desktop and kiosk sizes; accessibility checks | Playwright |
| LLM eval | Field-level accuracy per model (nightly) | Custom harness |
