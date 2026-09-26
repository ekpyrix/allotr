# Allotr — Command grammar

One grammar is used everywhere: web quick entry, chat gateways and MCP. It is
deterministic, works offline and never needs AI. When AI is enabled, lines the
grammar cannot parse are passed to the LLM, which returns a proposal for the
user to confirm ([domain.md](domain.md#ai-boundaries)).

All examples use made-up accounts and amounts.

## Syntax (v1)

```
entry     := amount ws category [ws "@" account [ws number]] [ws date]
             [ws "#" tag]* [ws "//" note]
amount    := ("+" | "-") [symbol] number [ws code]     # -12.50 · -€45 · -45 EUR
split     := amount ws (category ws number)+           # -80 groceries 60 home 20
iou       := entry ws "owe:" name ws number            # part of an entry owed to me
repay     := "+" number ws "from:" name [ws "@" account]
transfer  := "=" number [ws code] ws account ">" account [ws number] [ws date]
balance   := "bal" [ws account [ws number]]            # query or reconcile
payday    := "payday" ws date
rate      := "rate" ws code [ws code] ws number        # manual exchange rate
undo      := "undo" [ws id]
query     := "?" text                                  # AI only
date      := dd "/" mm ["/" yyyy] | "today" | "yesterday" | "yday"
code      := ISO 4217 alphabetic code, case-insensitive
```

- `-` is spending, `+` is income.
- Names (accounts, categories) resolve through the user's aliases,
  case-insensitively.

## Examples

```
-12.50 food                       spend $12.50 on Food from the default account
-4 coffee @card                   spend from Daily Card
-79 food @wallet 28/08            back-dated entry
-80 groceries 60 home 20          split across two categories
-60 dinner owe:alex 30            paid $60; $30 is owed back by Alex
+30 from:alex @card               Alex repays
+4000 salary                      paycheck (opens a new cycle)
=300 main>card                    transfer between accounts
=100 usd-card>eur-wallet 91.50    cross-currency transfer, both amounts recorded
-45 EUR food @card 49.20          €45 purchase charged as $49.20
bal card 65.18                    reconcile Daily Card against the bank
payday 25/10                      override the next payday
rate eur 1.09                     set a manual exchange rate
undo                              reverse the last entry
? food this cycle vs last         AI question
```

## Batches and dates

- A message with several lines logs a batch; each line is parsed on its own.
- A line without a date inherits the date of the previous dated line in the
  same message; otherwise it is today (in the user's timezone).

## Defaults

- Spending without `@account` uses the category's default account, then the
  user's default spending account.
- Income without `@account` uses the default income account.
- An amount without a currency uses the account's currency. Ambiguous symbols
  (`$`, `¥`, `kr`) resolve to the user's default currency first; ISO codes are
  always exact.
- A foreign amount on an account in another currency asks for the charged
  amount unless it is given.

## Chat platforms

Each gateway renders the same command registry in its platform's style:
slash commands where the platform expects them (for example in Discord
server channels) and plain text elsewhere. Replying to a receipt with a new
line replaces that entry; replying `undo` reverses it.

## Errors

A line that fails to parse is never committed. The reply names the
problem and shows the closest valid form, e.g.:

```
Couldn't read "-12.50 fod": unknown category "fod". Did you mean "food"?
```

## Tests

Every grammar rule has golden cases in `testdata/golden/` (input line →
expected JSON). Parse-error reports from users become new golden cases.
