# 0005. On-budget / off-budget account model

- Status: Superseded by 0021
- Date: 2026-09-27

## Context

The core promise is that daily usable money never includes savings. The
v0.1 draft tracked every posting against both an account and a pool (an
account × pool matrix). That makes routine entries produce negative cells
(for example, spending from an account whose balance is mostly reserved for
bills) that the user must correct with bookkeeping-only entries.

## Decision

Each account is either on-budget (spendable) or off-budget (savings). Daily
usable = (on-budget balance − unpaid reserved bills) ÷ days left, derived by
entry date from the ledger. Transfers between the groups are the only way
money enters or leaves the budget. Figures are expressed in the user's default
currency, converting other-currency accounts at display time (see ADR 0010). Savings goals are earmarks on the
off-budget total. Behavioural choices (bills reservation, leftover,
overspend, savings withdrawal, payday rule, paycheck split, extra income,
reconcile mismatch) are per-user policy settings implemented as strategies
in core; ledger invariants are not configurable.

## Consequences

- No per-entry pool tagging; entries stay one line.
- Follows the established envelope-budgeting pattern (on-budget vs. tracking accounts), familiar to PFM users.
- Cannot answer "how much of account X is for purpose Y"; accepted.
- Each policy strategy needs its own property tests; shared invariants keep the matrix bounded.
