# 0010. Multi-currency ledger with a switchable default currency

- Status: Accepted
- Date: 2026-09-27

## Context

Allotr targets users anywhere, and many people hold money in more than one
currency (travel, remote work, family abroad). Every ISO 4217 currency must
be usable, with a per-user default currency (USD for new installs) that can
be changed at any time. Currencies have different minor units (JPY 0, USD 2,
KWD 3). Converting amounts at entry time would lose the real amounts moved,
and exchange-rate lookups must not be required, to keep the privacy stance
(no outbound calls by default).

Options: single currency per user; convert everything to a base currency at
entry; per-account currency with per-currency balancing (the Beancount and
hledger model).

## Decision

- Each account has one ISO 4217 currency. Each posting stores an integer
  amount in its currency's minor unit plus the currency code.
- Transactions balance per currency. Cross-currency transactions record both
  real amounts and balance through an `Equity:Conversion` trading account;
  the implied rate is stored on the transaction.
- Each user has a default (reporting) currency, USD by default. Changing it
  never rewrites the ledger; reports and the daily usable figure are
  converted at display time using stored rates, rounded half to even once at
  the target minor unit. Missing rates are flagged, never guessed.
- Rates are exact decimal strings in `fx_rates`. The default source is
  manual entry. On a user's first account in a non-default currency, Allotr
  asks whether to fetch rates from Frankfurter (ECB). Providers implement a
  `RateProvider` interface: Frankfurter, one broad-coverage keyed provider, a
  generic JSON source (URL template + JSON path), and manual entry. Requests
  send only currency codes and dates.
- An account's currency is fixed at creation; changing it means archiving
  the account and opening a new one.
- The ISO 4217 table (codes, minor units) is vendored in `packages/shared`
  and refreshed by a scheduled job; `Intl` provides localized names,
  symbols and formatting.

## Consequences

- Real amounts are always preserved; Beancount export maps directly (`@@` prices).
- The ledger and projections carry a currency everywhere, so the core and
  its property tests grow (random currencies and exponents 0, 2, 3).
- The daily usable figure depends on rates when on-budget accounts span
  currencies; stale or missing rates are surfaced to the user.
- Unrealised FX gain/loss and market revaluation are out of scope.
