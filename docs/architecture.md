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
| Web | React + Vite, TanStack Router/Query, React Aria Components, Tailwind with generated role tokens and container queries, Remix Icon 4.5.0 (compiled SVG), Geist and Geist Mono, palette themes, PWA | [0016](adr/0016-palette-themes.md), [0026](adr/0026-visual-language-v3.md), [0027](adr/0027-navigation-v3.md), [0028](adr/0028-ui-foundation-v2.md); spec in [ui.md](ui.md) |
| Charts / motion | In-house SVG chart kit (monotone curves, HTML labels); CSS transitions and View Transitions with generated easing tokens | [0028](adr/0028-ui-foundation-v2.md) |
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
cached numbers. The worker also shows Web Push notifications and opens the
app path a notification names (only a path inside the app), for a device whose
user turned push on.

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
  (`/v1/admin/settings`: registration mode, required 2FA, theme import from a URL) are Allotr routes.
  While 2FA is required, turning it off is refused (`two_factor_required`)
  and `/v1/session` reports `twoFactorEnforced`. Invite links open the web
  app's public `/invite/<token>` page.
- Pools (ADR 0021) are served under `/v1/pools`: list with balances,
  add, and rename, switch or archive. `PUT /v1/accounts/{id}/pool` moves an
  account into a pool from a date. `GET`/`PATCH /v1/settings/ledger` carry
  `countSavingsInDaily`.
- Budgets (ADR 0021) are served under `/v1/budgets`: the status for the
  current period (every budget's planned, carried, spent, left and held, free
  money and the daily number), plan, change and end. Budgets are virtual and
  computed from the ledger on each read. `GET`/`PATCH /v1/settings/ledger` also
  carry `budgetPeriod` (`cycle`, `month`) and `dailyMode` (`free`,
  `pool-minus-bills`, `daily-budgets`). Cover is computed on read as well:
  `PUT /v1/budgets/cover-order` saves the order, `GET /v1/budgets/covers`
  lists this period's covered entries, `POST /v1/budgets/cover-preview`
  tells the entry sheet what an expense would take before it is saved, and
  `PUT`/`DELETE /v1/transactions/{id}/cover` set or clear a per-entry
  override, a setting that changes no ledger row.
- IOUs (ADR 0024) are served under `/v1/ious`: `GET` lists them with
  totals, `POST` lends, borrows or splits a bill (one entry, one IOU per
  person), `POST /v1/ious/repayments` records a payment that names the IOUs it
  settles, `POST /v1/ious/{id}/write-off` writes off what is left (any time the
  user asks; `iouWriteOffAfterDays` sets when it is offered), `PATCH /v1/ious/{id}` corrects a name
  or due date, `GET /v1/ious/people` suggests earlier names and
  `POST /v1/ious/cover-preview` tells the entry sheet what lending would take.
  Undo goes through `POST /v1/transactions/{id}/reverse`. Figures are
  computed on read; the money is in the ledger.
- The payday plan and insights are read-only projections: `GET /v1/payday-plan`
  (the sheet) and `POST /v1/payday-plan/confirm` (budget amounts plus one
  savings transfer, idempotent per cycle), `GET /v1/insights/emergency-fund`,
  `GET /v1/insights/net-worth?days=` and `GET /v1/insights/weekly-review`.
  `payYourselfFirst` and `emergencyMonths` are ledger settings.
- The ledger is served under `/v1/accounts`, `/v1/categories`, `/v1/tags`
  and `/v1/transactions`. Undo (`POST /v1/transactions/{id}/reverse`),
  edit (`…/edit`) and going back to an earlier version of an edited entry
  (`…/revert`) only append entries. An edit's replacement carries
  `replacesId` and the version it replaced `replacedById`; the list leaves
  earlier versions and their undos out. An `Idempotency-Key` header on
  `POST /v1/transactions` makes a repeat return the entry it first created
  (200) instead of recording another, as offline queues need. Each page
  of `GET /v1/transactions` carries `dayTotals`: for every day on the
  page, the net change all of that day's matching entries made to the
  user's own accounts (or the filtered account), in the default currency
  at the day's rate. It also carries `totals` (`count`, and per currency
  `spent`, `income` and `net` = income − spent) for every entry the filters
  match, ignoring paging, and with `group=day|category` a `groups` array of
  the same figures per day (newest first) or category. Totals are never
  summed across currencies or converted; transfers, loans and repayments are
  neither spent nor income, an undo cancels its entry, and a split counts
  each line in its own category. An expense
  or income takes either `categoryId` or a split, `lines: [{categoryId,
  amount}]` (2–20 distinct categories adding up to the amount, or to
  `foreignAmount` when given; `split_mismatch`, `invalid_split`); a split
  entry's own `categoryId` is null and each balancing posting carries its
  line's category. An entry may carry `occurredTime` (HH:MM, user's
  timezone), kept only when the `entryTimes` ledger setting is not `off`.
  `POST /v1/transactions/{id}/move` with `{afterId}` (null for first)
  rearranges a day (domain.md "Order within a day"): it updates only
  `transaction_ranks`, refuses another day's entry (`different_day`) and a
  move that puts timed entries out of time order (`out_of_time_order`).
  `POST /v1/accounts/{id}/reconcile` compares the bank's balance with the
  ledger's on a day and records a match; a debt can be given as a
  positive `amountOwed` instead of a negative `balance`. With `adjust` it
  posts the difference as an Unrecorded entry in the same database
  transaction, refused as `reconcile_stale` when `expectedDifference` no
  longer holds, or recorded as a match when the difference is now zero.
  Accounts report `lastReconciledOn`.
  `GET /v1/transactions` pages newest first (by date, then the user's
  order within the day, `sortRank`) and filters by date range,
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
  motion, haptics, celebrations and density settings beside them (density
  is compact unless the device chose comfortable), so
  `theme-init.js` paints them before the app loads. The web app sends v2
  bodies. Its importers (`apps/web/src/features/themes/importers/`) read
  a theme file (v1 or v2), a palette file (one palette, or several
  flavours of a family in one JSON file), base16 or base24 YAML, and
  terminal colour configs (TOML, key-value lines, JSON or an XML property
  list of ANSI colours) in the browser; the shape of the text picks the
  parser. One theme opens in the editor; a family's flavours are saved at
  once. The importers live in `packages/shared/src/theme/import/`, so the
  server reads the same shapes: when an admin allows it (`themeUrlImport`,
  off by default, also on `/v1/session`),
  `POST /v1/settings/themes/import-url` fetches an https address and
  answers with the parsed themes, saving nothing. The fetch
  (`apps/server/src/theme-url.ts`) refuses credentials in the URL and any
  name that resolves to a loopback, private, link-local, carrier-grade
  NAT, multicast, reserved or documentation address (IPv4, IPv6 and
  IPv4-mapped), connects to the address it checked, follows no
  redirects, and stops after 5 s or 64 KB; each user gets 10 an hour. The default themes'
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
  `POST /v1/bills/{id}/payments` marks a due date paid and needs either
  `paid`, to record the expense, or `transactionId`, to link one that
  already took money out of the bill's account; `DELETE
  …/payments/{dueOn}` undoes the mark and any entry it recorded. A bill's optional `price` in another
  currency makes it reserve what its latest payment took.
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
- `GET /v1/reports/categories?period=cycle|month` gives spending and income
  per top-level category for a payday cycle (the open one, or `cycle=` the
  day another opened) or a calendar month (`month=YYYY-MM`, default the
  current one). Subcategories are rolled up by the server
  (`rollUpCategories` in `packages/core`, property-tested), each group lists
  its children largest first, and a merged category counts as the one it
  merged into. The web app shows the top two children per card, expands to
  the rest, and takes the period and "always expand" from the user's ledger settings
  (`reportPeriod`, `categoryCards`), so every device shows the same views.
- `GET /v1/reports/calendar?from=&to=` gives one row per day (at most 62;
  the current month when both are left out): pace spending (linked bill
  payments left out), a heat level from 0 to 4 against the busiest day, bills
  due, payday and unsettled IOU due dates. It is the `calendar` projection in
  `packages/core`, computed on every request. The web calendar toggles the
  spending and dues layers and shows a table of the same days.
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
Transactions need `occurredOn`, and an expense, income, transfer or
write-off may give `time` (HH:MM); within a day, entries keep the order
they have in the bundle. An account without `openedOn` opens on the
earliest entry day. A transaction `ref` lets a bill payment or a
reconciliation's adjustment link to it. An expense or income gives
`category` or, for a split, `lines: [{category, amount}]`. A `write_off`
entry (`account`, `balance`) empties an account into Expenses, as archiving
does. An account may list `switches: [{on, budgetGroup}]`, later moves on or
off budget (its `budgetGroup` is the group it started in), and
`archived: true`, applied last and only at a zero balance
(`account_not_empty`). `reconciliations: [{account, on, stated, computed,
adjustment?}]` restore last-reconciled dates. A category that matches an
existing one takes the bundle's `isPaycheck`. A new category may carry
`colour` (`series-1` to `series-8`) and `icon` (a name from the fixed set in
`packages/shared/src/category-style.ts`); a match keeps its own style. IOUs travel as their own entry
kinds: `iou` (`direction`, `account`, `people: [{ref?, person, amount,
dueOn?}]`, and `ownShare: {amount, category}` for a split bill), `iou_payment`
(`account`, `settles: [{iou, amount}]`) and `iou_write_off` (`iou`,
`category`), where `iou` is the `ref` of a person line of an earlier entry.
Settings may carry `iouWriteOffAfterDays`.

The budget setup (ADR 0021) is additive within version 1, so a bundle
without it is still valid and an older server refuses a bundle that has it
(unknown fields). `settings` may also carry `countSavingsInDaily`,
`budgetPeriod` and `dailyMode`. `pools: [{name, kind, countsTowardDaily?,
archived?, defaultFor?}]` lists the pools; `defaultFor: "on"|"off"` stands
for the Budget or Savings pool every ledger starts with, which the bundle
renames or switches rather than creates. An account's `poolMoves: [{on,
pool}]` are its later moves, by pool name, applied after its switches.
`budgets: [{name, target, mode?, leftover?, startedOn?, endedOn?,
amounts}]` have a `target` of `{kind: "category", category}`, `{kind: "tag",
tag}` or `{kind: "buffer"}`, and `amounts: [{from, amount}]` in the default
currency; a bundle with a Buffer replaces the one a new ledger has, so its
start and amounts are the bundle's. `coverOrder` lists `"free"` and
`{budget: name}`, and `coverOverrides: [{transaction, covers: [{source,
amount}]}]` names the `ref` of a spending entry. Budget and cover names are
those of budgets in use. Pools, budgets and the cover are refused on a ledger
that already has any of its own (`ledger_not_empty`).
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
    },
    {
      "name": "Streaming",
      "account": "Wallet",
      "amount": { "amountMinor": 1900, "currency": "EUR" },
      "price": { "amountMinor": 1250, "currency": "USD" },
      "category": "Bills and subscriptions",
      "dueDay": 5
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
  archived account, pool or ended budget whose name was reused becomes
  `"<name> (archived)"` or `"<name> (ended)"`; a
  `/` in a category name becomes `∕`; a bill payment for a day the bill is
  no longer due on is left out. Entries keep their time of day (`time`)
  and, within each day, the user's order. Lost on the way: undo history
  and `amended` markers, when entries were recorded, unused tags, category
  order and default accounts, cover that names a budget that has ended, and
  the start of a ledger that was not itself
  imported.
  A ledger over the import limits exports but does not import back.
- `csv`: one row per posting, every entry including undos, RFC 4180:
  `date, entry_id, kind, account, amount, currency, category, note, tags,
  reverses_id, recorded_at, time`, in the user's order within each day.
  System legs are `Expenses`, `Income`,
  `Equity:Opening` and `Equity:Conversion`; text starting with `= + - @`
  gets a leading `'` so spreadsheets do not run it.
- `beancount`: every entry including undos, with `id`, `kind`, `time` and
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
| Environment / Docker secrets | Bootstrap and secrets only: `ALLOTR_DATABASE_PATH`, `ALLOTR_BASE_URL`, `ALLOTR_SECRET_KEY`, `ALLOTR_HOST`, `ALLOTR_PORT`, `ALLOTR_LOG_LEVEL`, `ALLOTR_REMINDER_INTERVAL_SECONDS`, `ALLOTR_SIGN_IN_REQUESTS_PER_MINUTE`, `ALLOTR_TRUSTED_PROXIES`, `ALLOTR_ROLE` (documented in `.env.example` and `deploy/.env.example`) |
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

The reminder job is the first one. An in-process timer (every
`ALLOTR_REMINDER_INTERVAL_SECONDS`, 900 by default) runs `runReminders`: for
each user it asks the `dueReminders` projection in `packages/core` what is due
today in the user's timezone (bills due today or tomorrow and unpaid, IOUs due
today and weekly while overdue, the weekly review once per ISO week), records
each in `reminders` under a unique (user, key) so it is made once, and pushes
only the new ones. The in-app feed is `GET /v1/reminders` (Settings, and the
Dashboard card for unread ones). Web Push is opt-in per device
(`/v1/push/subscriptions`): the payload is encrypted (RFC 8291) and signed
with the instance's VAPID key (RFC 8292) using `node:crypto`, so there is no
push library; the user-supplied endpoint gets the same guard as theme URLs
(https, public addresses only, pinned connection, no redirects). The VAPID
pair is created at first start and stored in `instance_settings` (key
`vapid_keys`); the database is plaintext by [ADR 0015](adr/0015-encryption-at-rest.md),
and the private key gets no extra layer (threat model in [SECURITY.md](../SECURITY.md)).
The hand-written encryption is pinned by the RFC 8291 example vector in
`apps/server/src/push/web-push.test.ts`.
A push service answering 404 or 410 removes the subscription.

## 9. Security and privacy

See [SECURITY.md](../SECURITY.md) for the threat model. Architectural rules:

- All user-supplied URLs go through one SSRF-safe HTTP client.
- No telemetry; every outbound call is opt-in and listed in
  [privacy.md](privacy.md) ([ADR 0011](adr/0011-no-telemetry.md)).
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
├─ docs/      PRD.md  architecture.md  domain.md  grammar.md  ui.md  adr/
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
| UI | Every signed-in route at 390, 820 and 1440 px with axe (WCAG 2.2 AA), screenshot comparisons and shell alignment checks ([ui.md §10](ui.md#10-testing)); keyboard navigation of the shell; kiosk sizes later | Playwright |
| LLM eval | Field-level accuracy per model (nightly) | Custom harness |
