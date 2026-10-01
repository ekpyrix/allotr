# 0021. Pools, budgets and cover

- Status: Accepted
- Date: 2026-10-01
- Supersedes: 0005 (on-budget / off-budget account model)

## Context

ADR 0005 splits accounts into on-budget and off-budget and derives one daily
number. It cannot answer "how much is planned for food this cycle", and the
only way to deal with an unplanned cost is to watch the daily number drop.
Real sub-account "pockets" fix the first problem but cause the second one
to get worse: every leftover or shortfall (a foreign-currency bill that took
a little more or less than planned) needs money moved by hand. Strict
zero-based envelopes need every dollar assigned and every overspend covered
by hand, which is the friction that makes people give up.

ADR 0005 also rejected tagging every posting with a pool. That still holds.

## Decision

- **Pool**: a named group of accounts with a `countsTowardDaily` switch and a
  kind (`spending` | `savings`). Each account is in exactly one pool. The
  defaults are *Budget* (spending, counts) and *Savings* (savings, doesn't);
  on-budget and off-budget accounts migrate into them. Users can add pools
  (e.g. *Emergency*). A savings pool counts toward the daily number only when
  the per-user setting `countSavingsInDaily` is on (default off). Moving an
  account between pools is effective from a date, like the budget switch.
- **Budget**: a planned amount per period on a category (a parent covers its
  children), or on a tag. Budgets are virtual: they are not tied to accounts,
  and nothing is ever moved. Spent and left are derived from entries. An
  entry counts toward at most one budget: a tag budget wins over a category
  budget, a child category over its parent.
- Each budget is **daily** (stays in the daily number) or **set aside** (held
  out of it). New budgets default to daily. Each budget chooses what happens
  to its leftover at period end: return to free money (default) or carry
  over (default for set-aside budgets).
- **Free money** is the counted pools' balance minus unpaid bills, minus
  what set-aside budgets still hold, minus what the user owes. A *Buffer*
  budget (set aside, carries over) is created by default.
- **Daily-number mode** (setting): free money ÷ days left (default) · counted
  pools − bills ÷ days left (ignores budgets) · daily budgets left ÷ days left.
- **Cover**: when spending passes what a budget has left, the shortfall is
  covered automatically in the user's **cover order** (one ordered list):
  Free, then Buffer, then budgets from lowest priority up. Bills are never
  used. When everything is used, the daily number goes negative and the
  overspend policy applies (default: carry the deficit). The entry sheet shows
  the cover before saving; reaching into a set-aside budget or Buffer needs a
  second tap. A user may change an entry's cover split later; that override
  is a setting on the entry, not a ledger change.
- **Refill**: money coming back (a refund, an IOU repayment) restores what
  its original entry's cover took, in reverse order, then goes to free money.
- **Period**: budgets and category summaries follow the cycle by default; a
  setting switches each to calendar months.
- Cover and refill are pure functions of the ledger, the budgets and the
  cover order, computed when read, never stored.

## Consequences

- Entries stay one line with one category; no posting is ever tagged with a
  pool or budget, so logging gets no extra fields.
- Bills keep their own model (due dates, payment marks, a price in another
  currency); their reserve already adjusts to what payments take, so a
  leftover or shortfall lands in free money with no move.
- Goals stay earmarks on savings pools.
- A new projection layer in `core` (budget status, cover, refill) needs
  property tests: covers never exceed what was available, cover + budget
  spent equals entry amount, refill never restores more than was taken,
  replaying gives the same numbers.
- Automatic cover drops the deliberate decision that strict envelope methods
  rely on. The entry sheet preview and a "covered this cycle" figure keep it
  visible.
