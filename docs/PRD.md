# Allotr — Product Requirements Document

| | |
|---|---|
| Status | Approved for v1 planning |
| Owner | @fnnyx |
| Last updated | 2026-09-27 |
| Related | [Architecture](architecture.md) · [Domain](domain.md) · [Grammar](grammar.md) · [ADRs](adr/) |

This document says **what** Allotr v1 must do and **why**. How it is built is
in [architecture.md](architecture.md); the reasoning behind hard-to-reverse
choices is in the [ADRs](adr/). All amounts and names are made up.

---

## 1. Problem

People who budget from paycheck to paycheck want one answer: **how much can I
spend today without eating into savings or bill money?**

Common approaches fail in predictable ways:

| # | Failure | Consequence |
|---|---|---|
| P1 | "Safe to spend" is computed from the **total balance**, savings included | Savings quietly become spending money |
| P2 | Logs and dashboards are kept separately | Two sources of truth that drift apart |
| P3 | Balances are copied by hand from bank apps | Tedious, error-prone, soon abandoned |
| P4 | Budget periods are calendar months or hard-coded dates | Breaks when payday moves or a month has 31 days |
| P5 | Money moved out of savings is not visible | Savings are raided without noticing |
| P6 | Entering a transaction takes many taps | Logging stops within weeks |
| P7 | People log in batches, often days later | Back-dated entries distort "today" figures |
| P8 | Many banks offer no export or API | Anything depending on bank sync fails |
| P9 | Hosted apps own the data and send telemetry | Privacy-minded users cannot use them |

## 2. Product vision

A self-hosted ledger where logging a transaction takes one line of text, and
the answer comes back immediately:

```
-12.50 food
✓ -$12.50 Food · Daily Card
Today left: $27.50 · $40.00/day for 24 days
```

The core rule: **daily usable money comes only from on-budget accounts minus
money set aside for bills. Savings are never included.**

## 3. Users

| Persona | Description | Primary needs |
|---|---|---|
| **Paycheck budgeter** (primary) | Salaried, paid once a month, several bank accounts and e-wallets, one savings account. Logs from a phone, often in the evening. | Fast entry, one trustworthy daily number, savings kept separate |
| **Irregular earner** | Freelance or variable income, no fixed payday. | Fixed-period budgets funded from income already received |
| **Multi-currency user** | Holds money in more than one currency (travel, remote work, family abroad). | Real amounts preserved, reports in a chosen currency |
| **Homelab admin** | Runs the instance for themselves and a few family members. | One-container install, invites, backups, no telemetry, safe upgrades |
| **Agent user** | Uses an AI agent or chat app as their main interface. | Log and query through chat or MCP with confirmation for changes |

## 4. Goals and non-goals

### Goals

| ID | Goal |
|---|---|
| G1 | Record a transaction in under 5 seconds from a phone. |
| G2 | Show today's usable budget until the next payday, from spendable money only. |
| G3 | Keep spendable money and savings strictly separate; every movement between them is visible. |
| G4 | Be correct by construction: double-entry, integer minor units, enforced and tested invariants. |
| G5 | Install with one `docker compose up` on amd64 or arm64; AI optional, local or cloud. |
| G6 | Users own their data: full export, account deletion, no telemetry. |
| G7 | Work well on phone, foldable, tablet, desktop and a wall display. |
| G8 | Multi-user login with per-user isolation. |
| G9 | Usable by external AI agents through an MCP server. |
| G10 | Support every ISO 4217 currency with a switchable default currency. |

### Non-goals (v1)

- Bank sync, open banking or screen scraping.
- Shared or household budgets (users are isolated).
- Credit cards, BNPL and loans (the data model allows them later).
- Investments, securities and crypto assets.
- Unrealised exchange-rate gain/loss accounting.
- Native mobile apps (the web app is an installable PWA).
- Tax filing.

## 5. Principles

1. **One number before detail.** Every screen leads with its key figure.
2. **Policies are configurable, invariants are not.** Behaviour choices are
   per-user settings with sensible defaults; money correctness is fixed.
3. **Deterministic first, AI second.** A grammar parser handles most input;
   AI only proposes, never commits by itself.
4. **Private by default.** No telemetry; every outbound call is opt-in.
5. **No shame.** Overspending is shown with the way back, not an alarm.

## 6. Functional requirements

Priority: **M** = must for v1, **S** = should for v1, **C** = could (v1.x).
Milestones refer to [§9](#9-release-plan).

### 6.1 Ledger and accounts

| ID | Requirement | Pri | MS |
|---|---|---|---|
| FR-L1 | Record expenses, income and transfers in a double-entry, append-only ledger. | M | M1 |
| FR-L2 | Accounts are **on-budget** (spendable) or **off-budget** (savings); any account can be switched, effective from that day. | M | M1 |
| FR-L3 | Each account has one ISO 4217 currency, fixed at creation. | M | M1 |
| FR-L4 | Correcting or deleting an entry posts a reversal (plus a new entry for edits); nothing is removed from the ledger. A deleted entry is hidden from lists and can be restored as a copy. | M | M1 |
| FR-L5 | Split one transaction across several categories. | M | M2 |
| FR-L6 | Track money owed to or by a person (IOUs) without affecting the daily number. | S | M7 |
| FR-L7 | Categories: editable starter set with two levels; free-form tags. | M | M1 |
| FR-L8 | Archive an account only at zero balance, offering a transfer or write-off. | M | M1 |
| FR-L9 | Reconcile any account against the bank's balance, with a one-tap adjustment for the difference. | M | M2 |
| FR-L10 | Recurring transactions with remind (default), auto-post or off. | S | M4 |

### 6.2 Cycles and daily budget

| ID | Requirement | Pri | MS |
|---|---|---|---|
| FR-C1 | A paycheck opens a new cycle; the previous cycle is closed and snapshotted. | M | M1 |
| FR-C2 | Next payday is predicted from a configured day of month and can be overridden at any time. | M | M1 |
| FR-C3 | Fixed-period cycle mode (monthly, every two weeks, weekly) for irregular income. | S | M4 |
| FR-C4 | Daily usable = (on-budget balance − unpaid reserved bills) ÷ days left, derived from the ledger by entry date. | M | M1 |
| FR-C5 | Show "left today" (based on the allowance at the start of the day) and the live daily figure. | M | M1 |
| FR-C6 | Back-dated entries, including into closed cycles, correct all affected figures automatically. | M | M1 |
| FR-C7 | Payday allocation: bills, spending allowance, savings and goals must add up to the income before confirming. | M | M4 |
| FR-C8 | Allocation strategies: fixed allowance (default), fixed savings amount, percentage. | M | M4 |
| FR-C9 | Configurable policies for bills, leftover, overspending, savings withdrawals, extra income, second paychecks and reconciliation (see [domain.md](domain.md#policies)). | M | M4 |
| FR-C10 | Savings goals as earmarks on the off-budget total, with progress. | S | M4 |

### 6.3 Input and chat

| ID | Requirement | Pri | MS |
|---|---|---|---|
| FR-I1 | One command grammar ([grammar.md](grammar.md)) used in the web app, chat gateways and MCP. | M | M3 |
| FR-I2 | Multi-line messages log a batch; lines without a date inherit the previous line's date. | M | M3 |
| FR-I3 | User-editable aliases for accounts and categories. | M | M3 |
| FR-I4 | Web quick entry: a structured form (M2), then the grammar parsed live into its editable fields (M3). | M | M2 |
| FR-I5 | Optional chat gateways (Discord, Telegram) with the same command set; slash commands where the platform requires them. | M | M3 |
| FR-I6 | Chat identities are linked to users with a one-time code. | M | M3 |
| FR-I7 | Replying to a bot receipt edits or undoes that entry. | S | M3 |
| FR-I8 | Import CSV, OFX and QIF with column mapping, duplicate detection and review before commit. | S | M7 |

### 6.4 AI (optional)

| ID | Requirement | Pri | MS |
|---|---|---|---|
| FR-A1 | AI is off by default and enabled with one toggle; the app is fully usable without it. | M | M5 |
| FR-A2 | Any OpenAI-compatible provider, plus native providers; a local-only mode refuses cloud providers. | M | M5 |
| FR-A3 | When the grammar fails, the LLM proposes a structured entry; the user confirms. | M | M5 |
| FR-A4 | Assistant (web panel and chat) can query, add entries and run what-if simulations; changes are proposals to confirm. | S | M5 |
| FR-A5 | MCP server with per-token scopes (`read`, `propose`, `write`, `kiosk`); new tokens default to read + propose. | M | M5 |
| FR-A6 | Conversation sessions per user and chat, with compression, visible notes and configurable retention. | S | M5 |

### 6.5 Web app

| ID | Requirement | Pri | MS |
|---|---|---|---|
| FR-W1 | Dashboard (the home view, `/`): today card with the hero number, pace bar, "needs attention" items, today's entries. | M | M2 |
| FR-W2 | Destinations Dashboard, Accounts, Transactions, Budget (bills for now) and Reports (the cycle, with history), plus Settings from the header gear or the sidebar foot; Savings under Accounts. Old addresses (`/today`, `/ledger`, `/cycle`, `/history`, `/savings`, `/settings#bills`) redirect. | M | M2 |
| FR-W3 | Responsive layouts for phone, foldable, tablet and desktop; installable PWA. On phones a floating flat pill tab bar with a separate round add button; from 600 px an ordinary sidebar. Tab switches are instant. | M | M2 |
| FR-W4 | Entries made offline are queued and synced later. | S | M7 |
| FR-W5 | Palette themes with a role map, fitted to WCAG 2.2 AA contrast; shipped palette families; custom themes by editor or import from common palette and terminal colour formats. | S | M2 |
| FR-W6 | Read-only kiosk view and a small embeddable card, accessed with a summary-only token. | S | M6 |
| FR-W7 | Onboarding reaches a first daily number in about three minutes. | M | M2 |
| FR-W8 | Flat, compact visual language: hairline grouped lists, 4/6/8/12 px radii, toggle groups for choices, an overflow menu for rare actions, skeleton loading, and value colour (negative red, positive green, transfers blue) always shown with a sign and an arrow. | M | M2 |

### 6.6 Currency

| ID | Requirement | Pri | MS |
|---|---|---|---|
| FR-X1 | All ISO 4217 currencies with correct minor units. | M | M1 |
| FR-X2 | Per-user default (reporting) currency; USD for new installs; switchable without rewriting the ledger. | M | M1 |
| FR-X3 | Cross-currency transfers and purchases record both real amounts. | M | M1 |
| FR-X4 | Exchange rates entered manually or fetched from an opt-in provider; missing rates are flagged, never guessed. | M | M4 |

### 6.7 Accounts, admin and integrations

| ID | Requirement | Pri | MS |
|---|---|---|---|
| FR-U1 | Onboarding creates the first admin; further users join by invite (default), open registration or not at all. | M | M0 |
| FR-U2 | Local accounts with TOTP 2FA; optional OIDC. | M | M0 |
| FR-U3 | Users can export all their data and delete their account. | M | M2 |
| FR-U4 | Export to CSV and Beancount. | M | M2 |
| FR-U5 | Notifications through chat, web push, or self-hosted push services. | S | M6 |
| FR-U6 | Signed outgoing webhooks for automation tools. | C | M6 |
| FR-U7 | Digests and reminders at configurable times in the user's timezone. | S | M6 |

## 7. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-1 | Correctness | Ledger invariants are enforced in the core and covered by property tests; no floating-point money. |
| NFR-2 | Performance | Chat reply < 300 ms for grammar input, < 5 s for LLM input; dashboard first paint < 1 s on a LAN. |
| NFR-3 | Privacy | No telemetry. Every outbound call is opt-in, minimal and listed in the app. CI verifies a default install makes no outbound requests. |
| NFR-4 | Security | Threat model and controls in [SECURITY.md](../SECURITY.md): 2FA, rate limiting, hashed tokens, SSRF-safe outbound client, strict CSP. |
| NFR-5 | Reliability | Starts cleanly after power loss; missed scheduled jobs run once; idempotent chat ingestion. |
| NFR-6 | Data safety | Encrypted nightly backups; automatic backup before migrations; restore tested in CI. |
| NFR-7 | Portability | One multi-arch image (amd64, arm64); runs on a small single-board computer. |
| NFR-8 | Accessibility | WCAG 2.2 AA; keyboard navigation; reduced-motion support. |
| NFR-9 | Internationalisation | Per-user locale, timezone and currency; UI text translatable. |
| NFR-10 | Upgrades | Any version upgrades to the latest release of the same major version in one step. |
| NFR-11 | API stability | `/v1` changes additively only; deprecations last at least two minor releases. |

## 8. Success metrics

| Metric | Target |
|---|---|
| Time to log an entry (phone, chat or quick entry) | Median < 5 s |
| Grammar parse success on the golden test set | 100% of golden cases; ≥ 90% of real-world lines without AI |
| LLM field accuracy on the eval set | ≥ 98% amount and sign; ≥ 95% category and account |
| Time from first login to first daily number | < 3 minutes |
| Reconciliation drift after one cycle of use | Explained or adjusted for every account |
| Outbound requests from a default install | Zero |

## 9. Release plan

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 Skeleton** | Monorepo, CI, image, server with SQLite, auth with 2FA, OpenAPI stub | `make dev` runs; login with 2FA works; CI green |
| **M1 Core ledger** | Accounts, categories, transactions, currencies, cycles, daily usable, invariants, CLI import, synthetic replay | Replay matches expected balances (including multi-currency); property tests green |
| **M2 Web app** | Today, ledger, accounts, settings, quick entry form, splits, reconcile, PWA, themes, export, account deletion, accessibility | Full manual use without chat; accessibility checks green |
| **M3 Grammar and gateway** | Parser, gateway process, Discord, identity linking, receipts, undo, reply-to-edit | A full week logged through chat |
| **M4 Paycheck flow** | Allocation, bills, recurring, policies, goals, FX providers | One full cycle closed by the system |
| **M5 AI** | Provider adapter, fallback parsing, assistant, MCP, sessions, evals | Eval targets met on the chosen model |
| **M6 Insights and notifications** | Savings rate, pace, digests, kiosk, embed, push, webhooks | Weekly digest delivered |
| **M7 v1.0** | Telegram, OIDC hardening, backups and restore test, importers, docs site, demo, IOUs, offline entry queue | v1.0.0 tagged |

## 10. Risks

| Risk | Mitigation |
|---|---|
| Logging fatigue | One-line entry, batches, reminders, offline queue, reconcile as an escape hatch |
| LLM mis-parses an amount | Grammar first; AI only proposes; append-only with undo |
| Too many settings | Policies isolated as strategies with their own tests; invariants shared |
| Personal data in the public repo | Synthetic fixtures only; ignored private test folder; secret scanning |
| Exchange-rate gaps | Real amounts always stored; missing rates flagged in the UI |
| Scope creep | Non-goals, milestone exit criteria, ADRs for new scope |

## 11. Out of scope for this document

Implementation details, data schemas and API endpoints are in
[architecture.md](architecture.md) and [domain.md](domain.md). Ideas beyond v1
are collected separately and revisited after v1 ships.
