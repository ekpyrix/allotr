# Synthetic replay fixtures

Made-up ledgers with hand-worked expected figures. Each directory holds:

- `bundle.json` — an import bundle (docs/architecture.md §5.1); `allotr
  import bundle.json --server <url>` accepts it as is.
- `replay.json` — what happens after the import and what the figures must
  be, replayed by `apps/server/src/replay.integration.test.ts`.

## replay.json

- `joinedOn` — the user's join day. The import runs at noon UTC that day.
- `steps[]` — at the instant `at`, one of:
  - `post`: an entry in the bundle's transaction shape (names, not ids;
    tags must already exist)
  - `reverse`: `{ occurredOn, note }` of the one live entry to undo
  - `edit`: `{ target: { occurredOn, note }, replacement }`
- `checkpoints[]` — at the instant `at`:
  - `balances`: every unarchived account by name. Balances are all-time,
    so only list them once every dated entry has happened.
  - `today`: any fields of `GET /v1/today`; `cycle` compares `openedOn`
    and `payday` only.

Steps run before a checkpoint at the same instant. Figures round down to
the minor unit. Keep notes unique per day for entries a step targets.

## Hand calculations

Days are the days left to payday. Amounts are in the default currency.

### single-currency-month

Cycle 1 runs 1 Mar → payday 25 Mar; Rent (due 5 Mar) and Phone (due 20 Mar) are reserved until paid. The 25 Mar paycheck opens cycle 2 (payday 25 Apr), which reserves April's Rent (5 Apr) and Phone (20 Apr).

| At (day) | Wallet on the day | Reserved | Available | Spent | Start | Days | Allowance | Left | Live |
|---|---|---|---|---|---|---|---|---|---|
| 1 Mar | 1,200.00 | 520.00 | 680.00 | 0 | 680.00 | 24 | 28.33 | 28.33 | 28.33 |
| 10 Mar | 635.00 | 20.00 | 615.00 | 20.00 | 635.00 | 15 | 42.33 | 22.33 | 41.00 |
| 24 Mar | 515.00 | 0 | 515.00 | 0 | 515.00 | 1 | 515.00 | 515.00 | 515.00 |
| 26 Mar | 2,985.00 | 520.00 | 2,465.00 | 30.00 | 2,495.00 | 30 | 83.16 | 53.16 | 82.16 |

### multi-currency-month

Conversions: USD 380.00 × 0.9 = EUR 342.00; JPY 6,800 ÷ 160 = EUR 42.50 (inverse quote, exact). On-budget native: EUR Current, USD Travel, JPY Yen cash; the KWD reserve is off-budget and never converted.

| Day | EUR | USD | JPY | Available (EUR) | Spent | Start | Days | Allowance | Left | Live | Missing |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 May | 1,550.00 | 380.00 | 6,800 | 1,892.00 | 0 | 1,892.00 | 23 | 82.26 | 82.26 | 82.26 | JPY |
| 12 May | 1,225.00 | 380.00 | 6,800 | 1,609.50 | 25.00 | 1,634.50 | 16 | 102.15 | 77.15 | 100.59 | — |
| 28 May | 3,025.00 | 380.00 | 6,800 | 3,409.50 | 0 | 3,409.50 | 31 | 109.98 | 109.98 | 109.98 | — |

### backdated-corrections

Yen, 0 digits. Cycle 2 runs 25 Jun → 25 Jul and reserves Rent due 27 Jun until paid. All steps happen on 29 Jun (Tokyo), 26 days before payday. The first checkpoint is 25 Jun 16:00 UTC, which is already 26 Jun in Tokyo.

| Checkpoint | Main | Reserved | Available | Spent | Start | Allowance | Left | Live |
|---|---|---|---|---|---|---|---|---|
| 26 Jun (29 days) | 693,000 | 80,000 | 613,000 | 0 | 613,000 | 21,137 | 21,137 | 21,137 |
| 29 Jun, before steps | 607,000 | 0 | 607,000 | 0 | 607,000 | 23,346 | 23,346 | 23,346 |
| after back-dated 12,000 on 15 Jun | 595,000 | 0 | 595,000 | 0 | 595,000 | 22,884 | 22,884 | 22,884 |
| after undoing the 10 Jun cinema (+2,000) | 597,000 | 0 | 597,000 | 0 | 597,000 | 22,961 | 22,961 | 22,961 |
| after editing 28 Jun 6,000 → 4,500 | 598,500 | 0 | 598,500 | 0 | 598,500 | 23,019 | 23,019 | 23,019 |
| after 3,000 spent today | 595,500 | 0 | 595,500 | 3,000 | 598,500 | 23,019 | 20,019 | 22,903 |
