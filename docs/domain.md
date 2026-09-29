# Allotr — Domain model

The rules of the ledger. Code in `packages/core` implements this document;
when they disagree, fix one of them in the same PR. All amounts are made up.

## Glossary

| Term | Meaning |
|---|---|
| **Account** | A place money sits: a bank account, e-wallet or cash. Has one currency. |
| **On-budget account** | Spendable money. Counts toward the daily number. |
| **Off-budget account** | Savings. Never counts toward the daily number. |
| **Envelope** | A purpose for on-budget money: available budget or reserved bills. |
| **Ready to assign** | Income not yet allocated to an envelope. |
| **Cycle** | The period from one paycheck to the next (or a fixed period). |
| **Allocation** | The split of a paycheck into bills, allowance, savings and goals. |
| **Daily usable** | Available budget ÷ days left in the cycle. |
| **Goal** | An earmark on the off-budget total, e.g. an emergency fund. |
| **Reconcile** | Compare an account with the bank's balance and post any difference. |
| **Posting** | One leg of a double-entry transaction. |
| **Proposal** | A transaction waiting for confirmation (from AI, import or a scoped token). |

## Invariants

These are enforced in `core`, checked on every commit and covered by property
tests. They are **not** configurable.

1. Postings in a transaction sum to zero **per currency**.
2. Committed postings never change. Corrections are reversals that reference
   the original, plus a new transaction for edits.
3. A posting's currency equals its account's currency.
4. Amounts are integers in the currency's ISO 4217 minor unit. No floats.
5. Exactly one open cycle per user.
6. An allocation's total equals the income it allocates.
7. Every user-owned row belongs to exactly one user; no cross-user reads.
8. Figures are pure functions of the ledger and settings, so replaying the
   same ledger always gives the same numbers.

## Money and currency

- Every amount is `{ amountMinor: integer, currency: ISO 4217 code }`.
  `$12.50` is `{ 1250, "USD" }`; `¥1200` is `{ 1200, "JPY" }`; `KWD 1.500` is
  `{ 1500, "KWD" }`.
- Each account has one currency, fixed at creation.
- Each user has a **default (reporting) currency**, USD for new installs,
  switchable at any time without rewriting the ledger.
- Cross-currency transactions record both real amounts and balance through a
  conversion account:

```
transfer $100.00 from USD Card to EUR Wallet, received €91.50

  Assets:USD-Card          -100.00 USD
  Equity:Conversion         100.00 USD
  Equity:Conversion         -91.50 EUR
  Assets:EUR-Wallet          91.50 EUR
  implied rate 0.915 EUR/USD stored on the transaction
```

- Exchange rates are exact decimals, only used to **report** foreign amounts.
  Conversion rounds half to even at the target minor unit, once, at display
  time. A missing rate is flagged, never guessed.
- A rate is a positive decimal string: how many units of the target
  currency one unit of the source currency buys (`0.915` turns USD into
  EUR). `packages/shared` is the only code that parses, formats or converts
  money.

## Accounts and double-entry

Balancing accounts follow standard double-entry practice
(`Income:Salary`, `Expenses:Food`, `Equity:Opening`, `Equity:Conversion`).
User-facing accounts are assets; `receivable` and `payable` kinds hold IOUs.

| Action | Effect on daily usable |
|---|---|
| Spend from an on-budget account | Lowers it |
| Transfer between two on-budget accounts | None |
| Transfer on-budget → off-budget (saving) | Lowers it |
| Transfer off-budget → on-budget (savings withdrawal) | Raises it; flagged |
| Income into an on-budget account | Per the extra-income policy |
| IOU: paid $60, $30 owed to you | Lowers it by $30 (your share); $30 sits in an off-budget receivable |

## Daily usable

```
days_left        = max(1, cycle_end − today)          # today counts, payday doesn't
available(d)     = on_budget_balance(end of d) − unpaid_reserved_bills(d)
start_of_day     = available(today) + spent_today
today_allowance  = start_of_day / days_left
left_today       = today_allowance − spent_today
live_daily       = available(now) / days_left
```

- "Today" is the user's local calendar day (home timezone by default).
- `today_allowance` is derived by entry date, not stored. A back-dated entry
  logged this morning corrects today's figure.
- The start of the day counts everything dated today except spending, so a
  paycheck that lands today is in today's allowance.
- `spent_today` is the on-budget side of today's entries that reach an
  Expenses account, less any undo. Moving money to savings lowers the
  allowance itself instead.
- Overspending today lowers tomorrow's allowance automatically.
- Daily figures round down, so they never promise more than is there; the
  spare minor units show up in later days.
- Accounts and bills in other currencies are converted to the default
  currency, each currency's total once, with the latest rate dated on or
  before the day (quoted either way round). A currency without a rate is
  left out and flagged.
- A bill is reserved from the day its cycle opens until the day it is
  paid; payments name the due date they settle. A payment mark is not a
  ledger entry: it may link the entry that paid it, and undoing the mark
  reserves the bill again.
- A bill is *due* once a due date in the cycle is today or past and it is
  not paid; the Today view lists it until it is marked paid.
- `cycle_spent` is `spent_today` summed from the day the cycle opened through
  today, each entry by the budget groups of its own day. The Today view's
  pace bar sets `cycle_spent / (cycle_spent + available)` against the share
  of the cycle's days gone. Paying a bill counts as spending, because the
  reserve is released at the same time.

Example: on-budget $1,800 after bills are reserved, 31 days left → $58.06/day.

## Cycles

- A transaction in a *paycheck* income category opens a new cycle and closes
  the previous one with a snapshot (opening balances, income, allocation,
  spending by category, leftover, savings net change).
- `cycle_end` is the next occurrence of the configured payday (day of month;
  shorter months use their last day), overridable at any time. From payday
  on, until a paycheck arrives, the cycle extends day by day; the day after
  payday it shows "payday overdue".
- A paycheck up to three days before payday opens the next cycle early; one
  earlier in the cycle adds to it. Undoing a paycheck merges its cycle back.
- **Fixed-period mode** (monthly on day N, every two weeks, weekly) serves
  irregular income: income lands in *ready to assign* and funds each period.
- The first cycle opens on the day the user joined, from opening balances,
  or with an older paycheck from imported history. Back-dated spending never moves it.
- Snapshots are computed from the ledger when read, never stored, so a
  back-dated entry amends a closed cycle's snapshot too.

## Policies

Per-user settings. The default is listed first.

| Policy | Default | Alternatives |
|---|---|---|
| Bills | Reserve at payday | No reservation · dedicated off-budget bills account |
| Leftover at payday | Ask, default sweep to savings | Always carry · always sweep |
| Overspend at payday | Carry the deficit into the next cycle | Cover from savings · ask |
| Savings withdrawal | Visible, no debt | Tracked debt with repayment prompt · confirm first |
| Payday rule | Fixed day of month (the 1st until set), overridable | Latest day of a window · last working day · manual |
| Cycle mode | Paycheck | Fixed period |
| Second paycheck in a cycle | Ask (guess: new cycle within 3 days of payday) | Always new cycle · always add |
| Paycheck split | Fixed allowance, rest to savings | Fixed savings · percentage |
| Extra income | Ask, default spendable | Always spendable · hold until payday |
| Reconcile mismatch | Offer one-tap "Unrecorded" adjustment | Auto-adjust · flag only |
| Recurring transactions | Remind on due date | Auto-post · off |
| Timezone while travelling | Home timezone | Follow device |
| Default currency | USD | Any ISO 4217 currency |

Each policy is a strategy in `core` with its own property tests; invariants
are shared by all strategies.

## Edge cases

| Case | Behaviour |
|---|---|
| Reversing the paycheck that opened the cycle | The cycle merges back into the previous one after a confirmation listing what is undone; the old snapshot is marked superseded. |
| Back-dated entry into a closed cycle | It belongs to the cycle of its date. That snapshot is recomputed and marked amended; the difference carries into the current cycle. Completed sweeps are not redone. |
| Archiving an account with a balance | Not allowed; the user transfers the balance or writes it off first. |
| Switching an account on/off-budget | Effective today, recorded as a dated system transaction. |
| Deleting a category in use | Must be merged into another category. |
| Editing any past entry | Reversal plus a new entry. |
| Offline entries arriving late | Treated as back-dated entries; idempotency keys prevent duplicates. |

## AI boundaries

- The LLM receives minimal context: account and category names, aliases,
  today's date and the figures it requests through tools.
- LLM output is validated against the same Zod schemas as any other input.
- The LLM never writes to the database. Its output becomes a **proposal**;
  the server commits only after confirmation, or directly only when the
  calling token has `write` scope.
- Figures in answers always come from fresh tool calls in the same turn.
- `local-only` mode refuses cloud providers.

## Data model

Logical model; the SQL schema lives in `migrations/`.

- System accounts balance the other side of an entry: one per user, role
  and currency (`Expenses`, `Income`, `Equity:Opening`,
  `Equity:Conversion`). They have no budget group and are not shown as
  accounts. The balancing posting carries the category. A split (FR-L5)
  has one balancing posting per line, each with its category, in the
  currency of the category side; the lines add up to that side exactly,
  and the transaction itself has no category. A split income with a
  paycheck line opens a cycle.
- A budget switch is a system transaction with no postings: it moves
  `switch_account_id` into `switch_budget_group` from `occurred_on`.
- A reversal carries the date of the transaction it reverses, so figures
  for past days are corrected as well.
- A merged category keeps its row with `merged_into_id` set, so committed
  transactions never change.
- New users get the starter categories as ordinary rows: Food (Groceries,
  Eating out), Transport, Housing (Rent, Utilities), Bills and
  subscriptions, Health, Shopping, Fun, Other; Paycheck (the paycheck
  category) and Other income.

```
users(id, name, locale, tz, default_currency, created_at)
api_tokens(id, user_id, name, scopes[], hash, last_used_at)
identities(id, user_id, platform, platform_user_id)
accounts(id, user_id, name, kind[asset|liability|receivable|payable|
         expense|income|equity], system_role[expenses|income|opening|
         conversion], budget_group[on|off], currency, counterparty_id, archived)
categories(id, user_id, name, kind[expense|income|transfer], parent_id,
           default_account_id, is_paycheck, merged_into_id)
tags(id, user_id, name) · transaction_tags(user_id, transaction_id, tag_id)
aliases(id, user_id, alias, target_type, target_id)
transactions(id, user_id, kind, occurred_on, created_at, source, category_id,
             note, reverses_id, idempotency_key, message_id, cycle_id,
             fx_rate_implied, switch_account_id, switch_budget_group)
postings(id, user_id, transaction_id, account_id, amount_minor, currency,
         category_id, position)
cycles(id, user_id, opened_at, opened_by_txn, cycle_end, closed_at, snapshot)
allocations(id, cycle_id, kind, amount_minor, currency)
bills(id, user_id, name, amount_minor, currency, account_id, cadence, due_day, active)
bill_payments(id, user_id, bill_id, due_on, paid_on, transaction_id)
recurring(id, user_id, template, schedule, mode, next_due)
goals(id, user_id, name, target_minor, earmarked_minor, currency)
counterparties(id, user_id, name)
fx_rates(id, user_id, base, quote, rate, as_of, source)
currencies(code, numeric, minor_unit, active)          -- ISO 4217, read-only
reconciliations(id, account_id, stated_minor, computed_minor, at, adjustment_txn_id)
proposals(id, user_id, source, payload, status, created_at, expires_at, session_id)
messages(id, identity_id, platform_msg_id UNIQUE, raw_text, received_at, parse_result)
chat_sessions(id, user_id, origin_platform, origin_id, created_at, last_message_at, summary)
chat_turns(id, session_id, role, content, created_at)
assistant_notes(id, user_id, text, created_at, updated_at)
webhooks(id, user_id, url, secret_hash, events[], active)
push_subscriptions(id, user_id, kind, endpoint, keys)
user_settings(user_id, key, value)
```
