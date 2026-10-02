# IOU golden fixtures

Hand-checked scenarios for IOUs and split bills (ADR 0024,
`docs/domain.md` "IOUs"). Each `*.json` file holds a small ledger whose
`lend`, `split`, `borrow`, `repayment` and `write_off` entries carry the
people and IOUs they create or settle, the budgets, and the day to look at,
with the expected figures. `apps/server/src/ious.golden.test.ts` replays every
file.

All names and amounts are made up. Accounts come from the core test chart:
`card-USD` counts toward the daily number, `savings-USD` does not. Amounts
are USD minor units. An IOU is named `<entry id>:<index of its person>`.
