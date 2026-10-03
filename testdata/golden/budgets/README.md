# Budget golden fixtures

Hand-checked scenarios for the budget projection (ADR 0021,
`docs/domain.md` "Budgets"). Each `*.json` file holds a small ledger, the
budgets, the settings and the day to look at, with the expected figures.
`packages/core/src/projections/budgets.golden.test.ts` replays every file.

All names and amounts are made up. Accounts come from the core test chart:
`card-USD` and `cash-USD` count toward the daily number, `savings-USD` does
not. Amounts are USD minor units.
