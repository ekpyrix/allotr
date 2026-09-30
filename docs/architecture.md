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

In M2 the form is structured fields only; the grammar line (M3) fills the same
fields. The web app sends the typed line to the same parser endpoint, shows the
result as editable fields, and posts a structured transaction on save.
Offline entries are queued in the browser with client-generated idempotency
keys and sent when the connection returns (M7).

### 4.3 Installable app and service worker

The web app ships a manifest (SVG plus PNG and maskable icons) and a service
worker built from `apps/web/src/sw/`. At build time the worker gets the list
of every file in the build and a version hashed from their contents. It
answers page loads with the cached `index.html` and build files from its
cache; API paths (`/v1/`, `/healthz`, `/readyz`, `/openapi.json`) and every
non-GET request go to the network untouched. Its cache holds build output
only, never user data. A new build installs beside the old one, and the page
offers **Reload** instead of switching by itself. Offline, the app still
opens and shows an offline notice in place of figures; it does not show
cached numbers.

### 4.4 Assistant and MCP

The assistant (web panel and chat) and external MCP clients use one tool set:
`get_today`, `query_report`, `list_transactions`, `simulate`,
`propose_transaction`, and, with write scope, `add_transaction`, `transfer`,
`reconcile`, `reverse`. Figures always come from fresh tool calls, never from
conversation memory. Changes are proposals unless the token has `write`
scope. See [domain.md § AI boundaries](domain.md#ai-boundaries).

## 5. API

- REST under `/v1`, JSON, OpenAPI 3.1 generated at `/openapi.json` and
  committed as `docs/openapi.json` (`make lint` fails when it is stale).
- Errors use RFC 9457 problem details, with a stable `code` member where a
  client may act on the error.
- Authentication ([ADR 0006](adr/0006-auth.md)) is Better Auth under
  `/v1/auth` (sign-in, TOTP 2FA, session list and revoke). The sign-in
  code step takes a TOTP code or a single-use backup code; wrong codes of
  either kind count toward one per-account 2FA lockout
  (`account_temporarily_locked`), and five wrong codes end the challenge
  (`too_many_attempts_request_new_code`). Onboarding
  (`/v1/onboarding`, first user becomes admin), single-use invites
  (`/v1/invites`), the current session (`/v1/session`) and instance settings
  (`/v1/admin/settings`: registration mode, required 2FA) are Allotr routes.
  While 2FA is required, turning it off is refused (`two_factor_required`)
  and `/v1/session` reports `twoFactorEnforced`. Invite links open the web
  app's public `/invite/<token>` page.
- The ledger is served under `/v1/accounts`, `/v1/categories`, `/v1/tags`
  and `/v1/transactions`. Undo (`POST /v1/transactions/{id}/reverse`) and
  edit (`…/edit`) only append entries. An `Idempotency-Key` header on
  `POST /v1/transactions` makes a repeat return the entry it first created
  (200) instead of recording another, as offline queues need. Each page
  of `GET /v1/transactions` carries `dayTotals`: for every day on the
  page, the net change all of that day's matching entries made to the
  user's own accounts (or the filtered account), in the default currency
  at the day's rate. An expense
  or income takes either `categoryId` or a split, `lines: [{categoryId,
  amount}]` (2–20 distinct categories adding up to the amount, or to
  `foreignAmount` when given; `split_mismatch`, `invalid_split`); a split
  entry's own `categoryId` is null and each balancing posting carries its
  line's category.
  `POST /v1/accounts/{id}/reconcile` compares the bank's balance with the
  ledger's on a day and records a match; a debt can be given as a
  positive `amountOwed` instead of a negative `balance`. With `adjust` it
  posts the difference as an Unrecorded entry in the same database
  transaction, refused as `reconcile_stale` when `expectedDifference` no
  longer holds, or recorded as a match when the difference is now zero.
  Accounts report `lastReconciledOn`.
  `GET /v1/transactions` pages newest first and filters by date range,
  account, category (with its subcategories, matching any line of a
  split), tag and note text; an undo
  matches whatever the entry it undoes matches. Every query is scoped to the signed-in user, and another
  user's rows answer 404. Domain errors from `core` and `shared` become
  problem details whose `code` is the error code without its namespace
  (`ledger.unbalanced` → `unbalanced`).
- `GET /v1/today` returns the daily figures (left today, today's allowance,
  live daily, days left, cycle end, spending so far this cycle, the overdue
  flag, unpaid bills due by today, every bill due date in the cycle with
  its payment day, and currencies left out for lack of a rate), computed
  from the ledger on every request. `onBudget` and `reserved` split
  `available` for charts; `reserved` is always exactly
  `onBudget − available`.
  `/v1/settings/ledger` holds the locale, time zone, default currency, payday
  day (the 1st until set) and payday override; switching the default currency
  changes figures, never entries. `/v1/settings/appearance` holds the theme
  mode (`light`, `dark` or `system`, the default) and the theme for each
  scheme: a shipped theme (a palette family such as Catppuccin, Allotr
  Classic or a community theme, in `packages/shared/src/theme/`) or one of
  the user's custom themes. Before any change the slots are Catppuccin
  Latte and Mocha; the earlier ids `light` and `dark` read as Allotr
  Classic. `/v1/settings/themes` keeps up to 20 custom themes per user as
  palette themes (theme file v2, ADR 0016): a palette and the roles it
  sets, each role resolved with contrast fitting, and a theme whose roles
  cannot meet WCAG 2.2 AA is refused with each role listed
  (`theme_contrast`). The deprecated v1 body (16 tokens) is still accepted:
  it is checked by the v1 contrast pairs, including destructive text on
  the dark-scheme outline button fills, and converted. Themes stored as v1
  are read as v2 and written back as v2 with the next change, and every
  response keeps the v1 `tokens` for older clients. Deleting a theme in
  use, or changing its scheme, puts that slot back on the default theme. The web
  app caches the mode and the resolved role colours of any slot not on its
  default theme in localStorage (`allotr.theme-roles`), with the per-device
  motion, haptics, celebrations and density settings beside them, so
  `theme-init.js` paints them before the app loads. The default themes'
  roles and the spring easings are generated into
  `apps/web/src/generated/tokens.css` (`pnpm --filter @allotr/web tokens`;
  lint fails when it drifts). `/v1/settings/setup`
  holds a new user's progress through setup (currency and region, payday,
  spending accounts, savings, bills): the steps saved or skipped and whether
  it is finished. With nothing saved, a user who has any account counts as
  finished, so older ledgers never see it; opening setup saves its start,
  and an import finishes it. The web app sends a user to `/setup` from
  Today until it is finished. `/v1/rates` takes manual exchange rates, one
  per pair and day. `/v1/bills` is the minimal bill list the reserve needs;
  `POST /v1/bills/{id}/payments` marks a due date paid and `DELETE
  …/payments/{dueOn}` undoes the mark.
- `GET /v1/cycles` lists every cycle's snapshot, newest first. Each one has
  income, spending, leftover and savings change in the default currency at
  the rate on the cycle's last day, plus the `amended` flag.
  `GET /v1/cycles/{openedOn}` adds the opening and closing balances,
  income and spending by category, and the entries that amended the cycle.
  Its `spendingTop` is what the category chart draws: the six largest
  spending categories and the rest summed into one `other` (count and
  amount), so the client adds nothing up. Each summary also has `offBudgetClosing`, the off-budget total at the end
  of its last day. `GET /v1/cycles/{openedOn}/days` gives the cycle day by
  day for charts: pace spending, cumulative pace spending, an even pace
  line, available at the end of the day and that day's allowance, from the
  same projection as `/v1/today` (ADR 0020). All are computed on every
  request, like today's figures.
- `GET /v1/accounts/{id}/history?days=30` gives an account's end-of-day
  balance for the last 7 to 365 days, in its own currency.
- `POST /v1/import` fills an empty ledger from a JSON bundle (see
  [§5.1](#51-import-bundle)): validated as a whole, then applied in one
  database transaction through the same writes as the API. A ledger that
  already has accounts, entries, bills or rates is refused
  (`ledger_not_empty`). When the imported history has a paycheck, its
  earliest day becomes the ledger's start, so the first cycle covers it.
- `GET /v1/export?format=json|csv|beancount` downloads all ledger data
  (see [§5.2](#52-export)).
- `POST /v1/user/delete` hard-deletes the signed-in user and every row
  they own, then clears the session cookie. It needs the password and,
  when 2FA is on, a TOTP or backup code; wrong ones count toward the
  sign-in lockout. The only admin cannot leave while other users exist
  (`last_admin`). Rows go by cascade from `users` (the ledger's
  append-only triggers allow deletes once the user row is gone), plus the
  user's `verifications` and `sign_in_failures`. It shares a lock with
  onboarding and invites, so a join cannot race the last user leaving.
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
earliest entry day. A transaction `ref` lets a bill payment or a
reconciliation's adjustment link to it. An expense or income gives
`category` or, for a split, `lines: [{category, amount}]`. A `write_off`
entry (`account`, `balance`) empties an account into Expenses, as archiving
does. An account may list `switches: [{on, budgetGroup}]`, later moves on or
off budget (its `budgetGroup` is the group it started in), and
`archived: true`, applied last and only at a zero balance
(`account_not_empty`). `reconciliations: [{account, on, stated, computed,
adjustment?}]` restore last-reconciled dates. A category that matches an
existing one takes the bundle's `isPaycheck`.
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
applying. Limits: 10 MB, 50,000 transactions and reconciliations, 1,000 of
each other list.
The import holds the database's write lock while it runs, roughly a second
per thousand transactions, so a bundle near the limit takes tens of seconds;
allow for that in a reverse proxy's timeout.

The CLI posts a bundle for you:
`allotr import <file.json> --server <url> [--email <address>]` checks the
file first, then asks for the password and, when two-factor is on, the
authenticator code, and signs out when done. It only prompts in an
interactive terminal.

### 5.2 Export

`GET /v1/export?format=` returns an attachment named
`allotr-export-<today>.<format>`:

- `json` (the default): the import bundle of §5.1, so an export imports
  back unchanged into an empty ledger. It holds the ledger as it stands:
  undone entries and the entries an edit replaced are left out with their
  undos, which leaves every balance and every day's figure as it was. An
  entry on a merged category is filed under the one it was merged into; an
  archived account whose name was reused becomes `"<name> (archived)"`; a
  `/` in a category name becomes `∕`; a bill payment for a day the bill is
  no longer due on is left out. Lost on the way: undo history and
  `amended` markers, times of entry, unused tags, category order and
  default accounts, and the start of a ledger that was not itself imported.
  A ledger over the import limits exports but does not import back.
- `csv`: one row per posting, every entry including undos, RFC 4180:
  `date, entry_id, kind, account, amount, currency, category, note, tags,
  reverses_id, recorded_at`. System legs are `Expenses`, `Income`,
  `Equity:Opening` and `Equity:Conversion`; text starting with `= + - @`
  gets a leading `'` so spreadsheets do not run it.
- `beancount`: every entry including undos, with `id`, `kind` and
  `reverses` metadata. Accounts are `Assets:`, `Assets:Receivable:`,
  `Liabilities:`, `Liabilities:Payable:` plus the account name, categories
  `Expenses:<Top>:<Child>` and `Income:…`, write-offs
  `Expenses:Write-off`, and `Equity:Opening-Balances` and
  `Equity:Conversion`; names are cleaned to letters, digits and dashes.
  Rates become `price` directives and budget switches
  `custom "allotr-budget-group"`. Every entry balances per currency, so no
  price annotations are needed.

`allotr export --server <url> [--format json|csv|beancount] [--out <file>]
[--email <address>]` signs in as `import` does and saves the file under the
server's suggested name, or `--out`. It never overwrites a file.

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
| End-to-end replay | Synthetic ledgers imported, then timed undo, edit and back-dated steps → expected balances and today's figures | Vitest + `testdata/synthetic/` |
| UI | Every signed-in route at phone and desktop sizes with axe (WCAG 2.2 AA); keyboard navigation of the shell; tablet and kiosk sizes later | Playwright |
| LLM eval | Field-level accuracy per model (nightly) | Custom harness |
