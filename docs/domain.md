# Allotr — Domain model

The rules of the ledger. Code in `packages/core` implements this document;
when they disagree, fix one of them in the same PR. All amounts are made up.

## Glossary

| Term | Meaning |
|---|---|
| **Account** | A place money sits: a bank account, e-wallet or cash. Has one currency. |
| **Pool** | A named group of accounts with a switch for whether it counts toward the daily number. Every account is in one pool. The defaults are *Budget* (counts) and *Savings* (does not). |
| **Counted account** | An account whose pool counts toward the daily number (the *on-budget* group in the API). Spendable money. |
| **Savings** | Money in pools that do not count. Never in the daily number unless the user turns on `countSavingsInDaily` and the pool's own switch. |
| **Budget** | A planned amount per period on a category (a parent covers its children) or a tag. Virtual: tied to no account, nothing is moved. *Daily* budgets stay in the daily number; *set-aside* ones are held out of it. |
| **Buffer** | A set-aside budget with no category that only holds money and carries over. Every user has one. |
| **Free money** | Counted accounts less unpaid bills and less what set-aside budgets still hold. The daily number divides it by default. |
| **Ready to assign** | Income not yet allocated to a bill, a budget or savings. |
| **Cycle** | The period from one paycheck to the next (or a fixed period). |
| **Allocation** | The split of a paycheck into bills, allowance, savings and goals. |
| **Daily usable** | Free money ÷ days left in the cycle (the default mode). |
| **Goal** | An earmark on the savings total, e.g. an emergency fund. |
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

## Pools

A pool (ADR 0021) is a named group of accounts. It has a kind, `spending`
or `savings`, and a `countsTowardDaily` switch. Every user starts with two
default pools: *Budget* (spending, counts) and *Savings* (savings, does not).
Users may add more, such as *Emergency*.

- An account is in exactly one pool on any day. Accounts follow the
  default pool of their budget group until moved into another pool.
- A move is effective from a date and recorded as a dated row, like the
  budget switch; it changes no entry. The latest change on or before a day
  decides that day's pool, whether it is a move or an on/off-budget switch.
  A back-dated move corrects past days through the same functions.
- A pool counts toward the daily number when its switch is on and, if it is
  a savings pool, the per-user setting `countSavingsInDaily` is on too
  (default off). One switch is never enough: savings are not counted by
  accident. The Budget pool always counts.
- An account counted on a day is *on-budget* for that day in every figure:
  the daily number, spending, cycle snapshots and the account totals.
  Switching an account on or off budget moves it into the default Budget
  or Savings pool.
- A pool holding accounts cannot be archived; the default pools cannot be
  archived at all.

## Budgets

A budget (ADR 0021) is a planned amount per period on an expense category,
or on a tag. A budget on a parent category covers its children. Budgets are
**virtual**: they are tied to no account, nothing is ever moved between
accounts for them, and no posting carries a budget. Spent and left are
derived from the entries every time they are read, so a back-dated entry
corrects past and present figures through the same function.

- **One budget per entry.** An entry counts toward at most one budget: a tag
  budget wins over a category budget, and a child category over its parent.
  If an entry has two tags that both have a budget, the budget planned first
  wins. Each line of a split counts by its own category; a tag budget takes
  the whole entry. A merged category counts as the one it was merged into.
- **What counts.** Spending counted by a budget is the expense side of an
  entry paid from a counted account, less its undo (an undone entry counts as
  if it never happened). Spending paid from a savings account is a withdrawal,
  not budget spending. Foreign amounts are converted to the default currency
  at the rate of the day asked about, as for the daily number, and a currency
  without a rate is left out and flagged. Entries that pace leaves out (linked
  bill payments, reconcile adjustments) do not count: a bill was already
  reserved, and an adjustment makes up for entries never recorded.
- **Daily or set aside.** A daily budget stays in the daily number; its
  figures only show how the month is going. A set-aside budget holds what it
  has left out of free money, so planning one lowers the daily number by its
  amount and spending inside it leaves the daily number alone. New budgets
  are daily.
- **Periods.** Each budget has an amount per period. A period is the cycle
  (default) or a calendar month (a setting). `left = planned + carried in −
  spent`. An amount changed during a period applies to all of it and to later
  periods; periods that are over keep theirs. A budget counts from the period
  that holds the day it was started, until the period that holds the day it
  was ended.
- **Leftover.** At the end of a period a budget's leftover either returns to
  free money (default for daily budgets) or carries into the next period
  (default for set-aside budgets). A carried leftover is never below zero: an
  overspend is not a debt of the budget.
- **Buffer.** Created for every user; set aside and carried over, and fixed
  that way. It starts with an amount of zero, and it only holds money.
- **Free money** = `available − Σ held`, where `held` is what each set-aside
  budget has left, floored at zero, and `available` is counted accounts less
  unpaid reserved bills.

Example: counted $5,000, Food $900 daily with $120 spent, Travel $300 set
aside with $100 spent, $50 spent outside any budget. Available is $4,730,
Travel still holds $200, free money is $4,530, and with 22 days left the
daily number is $205.90.

## Daily usable

```
days_left        = max(1, cycle_end − today)          # today counts, payday doesn't
available(d)     = on_budget_balance(end of d) − unpaid_reserved_bills(d)
start_of_day     = available(today) + spent_today
today_allowance  = start_of_day / days_left
left_today       = today_allowance − spent_today
live_daily       = available(now) / days_left
```

- `on_budget_balance` is the balance of the counted accounts (see Pools).
- The daily-number mode decides what is divided. With budgets, the default
  *free money* mode replaces `available` by `free = available − held`, and
  spending paid out of a set-aside budget's hold is neither part of the start
  of the day nor of `spent_today`, since that money was never in the daily
  number. *Counted − bills* keeps the formulas above and ignores budgets.
  *Daily budgets left* divides what the daily budgets have left, and only
  spending in those budgets counts against it. Without budgets the Buffer is
  empty and the first two modes give the same figures as before.
- "Today" is the user's local calendar day (home timezone by default).
- `today_allowance` is derived by entry date, not stored. A back-dated entry
  logged this morning corrects today's figure.
- The start of the day counts everything dated today except spending, so a
  paycheck that lands today is in today's allowance.
- `spent_today` is the on-budget side of today's entries that reach an
  Expenses account, less any undo. Moving money to savings lowers the
  allowance itself instead.
- Payments linked to a bill, and their undos, are left out of
  `spent_today` (and so out of `start_of_day`), the same entries pace
  leaves out. The bill's reserve already left `available`, so paying it
  changes neither `today_allowance` nor `left_today`.
- Overspending today lowers tomorrow's allowance automatically.
- Daily figures round down, so they never promise more than is there; the
  spare minor units show up in later days.
- Accounts and bills in other currencies are converted to the default
  currency, each currency's total once, with the latest rate dated on or
  before the day (quoted either way round). A currency without a rate is
  left out and flagged.
- A bill is reserved from the day its cycle opens until the day it is
  paid; payments name the due date they settle. A payment mark is not a
  ledger entry, but it always comes with one, so the reserve and the
  balance move together. Paying either records the entry, an expense of
  the amount paid from the bill's account under the bill's category and
  dated the day paid, or links an entry already in the ledger: one in
  effect that took money out of the bill's account and pays no other due
  date, whose date the payment then takes. Undoing the mark reserves the
  bill again; it undoes an entry it recorded, and keeps one it linked.
  Marks made before this rule may have no entry and stay as they are.
- A bill may have a **price** in another currency than its account's, such
  as a subscription priced at $12.50 and paid from a THB account: the
  card's rate and fees change what each month takes. Such a bill reserves
  what the latest payment for an earlier due date took from the account,
  or its own amount, an estimate, until a payment has taken one. A payment
  whose entry was undone takes nothing. The price is shown, never
  converted into the reserve, and the paying entry records it as its
  foreign amount (FR-X3).
- A bill is *due* once a due date in the cycle is today or past and it is
  not paid; the Today view lists it until it is marked paid.
- `cycle_spent` is `spent_today` summed from the day the cycle opened through
  today, each entry by the budget groups of its own day. Paying a bill
  counts as spending, because the reserve is released at the same time.
- `pace_spent` is `cycle_spent` without two kinds of entry, and without
  their undos: a payment linked to a bill's payment mark (the bill was
  already reserved) and a reconcile adjustment (it makes up for entries
  never recorded, not new spending). Both still lower `available`. A bill
  payment that is not linked to its mark still counts. The Today view's
  pace bar sets `pace_spent / (pace_spent + available)` against the share
  of the cycle's days gone, so paying a bill or reconciling never makes the
  pace look worse.

Example: on-budget $1,800 after bills are reserved, 31 days left → $58.06/day.

## Cycles

- A transaction in a *paycheck* income category opens a new cycle and closes
  the previous one with a snapshot (opening balances, income, allocation,
  spending by category, leftover, savings net change).
- `cycle_end` is the next payday predicted by the *payday rule* (see
  Policies; by default the configured day of month, shorter months using
  their last day), overridable at any time. From payday
  on, until a paycheck arrives, the cycle extends day by day; the day after
  payday it shows "payday overdue".
- A paycheck up to three days before payday opens the next cycle early; one
  earlier in the cycle adds to it. Undoing a paycheck merges its cycle back.
- **Fixed-period mode** (monthly on day N, every two weeks, weekly) serves
  irregular income: income lands in *ready to assign* and funds each period.
- Until a paycheck opens a cycle, Today offers to record the first one (an
  income entry in the paycheck category, saved like any other entry). It is
  the only way to open a cycle.
- The first cycle opens on the day the user joined, from opening balances,
  or with an older paycheck from imported history. Back-dated spending never moves it.
- The first cycle opens on the day the user joined. An imported history
  with a paycheck starts on its earliest imported day instead, if that is
  earlier.
- Snapshots are computed from the ledger when read, never stored, so a
  back-dated entry amends a closed cycle's snapshot too.
- A closed cycle is *amended* when an entry dated in it was recorded after
  the paycheck that closed it. This covers new entries, undos and edits.
  The close is when the first paycheck dated that day was recorded, so
  editing the paycheck later does not hide an amendment. Entries imported
  together share one recording time, so they never count.
- A snapshot's opening balances include accounts opened during the cycle.
  An opening balance is money that was already there, so it is never
  counted as income or as savings.
- Snapshot figures are in the default currency at the rate on the cycle's
  last day. Spending by category counts every expense, whichever account
  paid it.

## Policies

Per-user settings. The default is listed first.

| Policy | Default | Alternatives |
|---|---|---|
| Daily-number mode | Free money ÷ days left | Counted accounts − bills ÷ days left (ignores budgets) · daily budgets left ÷ days left |
| Budget period | Follows the cycle | Calendar month |
| Savings in the daily number | Off: savings pools never count | On: a savings pool whose own switch is on counts too |
| Bills | Reserve at payday | No reservation · dedicated off-budget bills account |
| Leftover at payday | Ask, default sweep to savings | Always carry · always sweep |
| Overspend at payday | Carry the deficit into the next cycle | Cover from savings · ask |
| Savings withdrawal | Visible, no debt | Tracked debt with repayment prompt · confirm first |
| Payday rule | Fixed day of month (the 1st until set), overridable | Last working day · manual · latest day of a window (not yet built) |
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

**Payday rule.** It predicts the payday when a cycle opens; a date set for
the open cycle always wins. `fixed` uses the configured day of the month.
`last-working-day` is the last Monday to Friday of the month; public
holidays are not known. `manual` predicts nothing: the user sets the
cycle's payday after each paycheck, and the configured day stands in until
they do. "Latest day of a window" is not built yet, as its meaning is still
open.

## Edge cases

| Case | Behaviour |
|---|---|
| Reversing the paycheck that opened the cycle | The cycle merges back into the previous one after a confirmation listing what is undone; the old snapshot is marked superseded. |
| Back-dated entry into a closed cycle | It belongs to the cycle of its date. That snapshot is recomputed and marked amended; the difference carries into the current cycle. Completed sweeps are not redone. |
| Archiving an account with a balance | Not allowed; the user transfers the balance or writes it off first. A write-off from an on-budget account counts as spending and a transfer to an off-budget account lowers the allowance, like any other entry; before either, the user is told how much today's figure drops, worked out by the same projection with the entry added. |
| Switching an account on/off-budget | Effective today, recorded as a dated system transaction; the account moves into the default Budget or Savings pool. |
| Moving an account into a pool | Effective from the chosen date (today by default), recorded as a dated row. No entry changes. |
| Deleting a category in use | Must be merged into another category. |
| Editing any past entry | Reversal plus a new entry. |
| Deleting an entry | A reversal. The app calls it delete and hides the entry and its reversal from lists unless the user asks to see deleted entries. |
| Restoring a deleted entry | A new copy of it: same kind, date, category, note, tags and postings. The copy is stored with idempotency key `restore:<original id>`, so an entry is restored at most once. A reversal or budget switch cannot be restored. |
| Offline entries arriving late | Treated as back-dated entries; idempotency keys prevent duplicates. |
| Reconciling with a difference | The bank's balance is compared with the ledger's at the end of the chosen day. A match is recorded. A difference is only recorded once adjusted: an expense (bank lower) or income (bank higher) dated that day, in the "Unrecorded" or "Unrecorded income" category, created on first use and found again by ID. Undoing the adjustment also takes back that reconciliation. If the difference has dropped to zero by the time the adjustment is asked for (the missing entry was logged meanwhile), a match is recorded and nothing is posted. |
| Reconciling a debt | Statements show a debt as a positive amount owed, so that is what is asked for; it is compared as the negative balance, and a credit is a negative amount owed. An account holds a debt when it is a liability or payable, or its balance is below zero. |

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
budgets(id, user_id, name, kind[category|tag|buffer], category_id, tag_id,
        mode[daily|set-aside], leftover[free|carry], started_on, ended_on)
budget_amounts(id, user_id, budget_id, effective_on, amount_minor, currency)
pools(id, user_id, name, kind[spending|savings], counts_toward_daily,
      default_for[on|off], position, archived)
pool_moves(id, user_id, account_id, pool_id, effective_on, created_at)
                                        -- append-only
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
bills(id, user_id, name, amount_minor, currency, price_minor, price_currency,
      account_id, category_id, cadence, due_day, active)
bill_payments(id, user_id, bill_id, due_on, paid_on, transaction_id, recorded)
recurring(id, user_id, template, schedule, mode, next_due)
goals(id, user_id, name, target_minor, earmarked_minor, currency)
counterparties(id, user_id, name)
fx_rates(id, user_id, base, quote, rate, as_of, source)
currencies(code, numeric, minor_unit, active)          -- ISO 4217, read-only
reconciliations(id, user_id, account_id, currency, on_date, stated_minor, computed_minor, adjustment_transaction_id, created_at)
proposals(id, user_id, source, payload, status, created_at, expires_at, session_id)
messages(id, identity_id, platform_msg_id UNIQUE, raw_text, received_at, parse_result)
chat_sessions(id, user_id, origin_platform, origin_id, created_at, last_message_at, summary)
chat_turns(id, session_id, role, content, created_at)
assistant_notes(id, user_id, text, created_at, updated_at)
webhooks(id, user_id, url, secret_hash, events[], active)
push_subscriptions(id, user_id, kind, endpoint, keys)
user_settings(user_id, key, value)
```
