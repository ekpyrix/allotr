# Rule: ledger invariants

The full model is in [docs/domain.md](../../docs/domain.md). These rules are
not configurable and must hold in every change to `packages/core`, the
server's persistence layer, importers and anything that creates transactions.

## Money

- Every amount is an integer in its currency's ISO 4217 minor unit **plus**
  its currency code. Never a bare number, never a float, never a string with
  a decimal point inside the domain.
- Parse and format money only through `packages/shared` money utilities.
- Exchange rates are exact decimals; convert once, at display or report
  time, rounding half to even. Never store converted amounts.
- A posting's currency equals its account's currency.

## Ledger

- Postings in a transaction sum to zero **per currency**.
- Committed transactions and postings are never updated or deleted. Undo is
  a reversal referencing the original; edit is a reversal plus a new entry.
- Exactly one open cycle per user. Allocation totals equal the income they allocate.
- Every user-owned query is scoped by `user_id`.

## Projections

- Balances, daily usable, cycles and reports are pure functions of the
  ledger, settings and a supplied "now". No hidden state, no stored
  snapshots that override the ledger.
- Back-dated entries must change past and present figures through the same
  functions, without special cases.

## Policies

- Behaviour choices are per-user policies implemented as strategies in
  `core` (see the policies table in docs/domain.md). New behaviour is a new
  strategy or option, not a change to an invariant.
- The maintainer's chosen behaviour is the default; alternatives are settings.

## AI

- LLM output is untrusted input. Validate it with the shared Zod schemas.
- The LLM never writes to the database. Its output is a proposal, committed
  only after confirmation or with a `write`-scoped token.
- Answers containing figures come from tool calls made in the same turn.

## When in doubt

If a change seems to require relaxing any rule above, stop and propose an
ADR draft in `docs/drafts/` instead.
