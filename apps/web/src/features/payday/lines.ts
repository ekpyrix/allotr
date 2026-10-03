import {
  formatMoneyInput,
  money,
  MoneyError,
  parseMoney,
  type ConfirmPlanBody,
  type Money,
  type PaydayPlanView,
} from '@allotr/shared';

// The payday sheet's text fields and their translation into the confirm
// request. Nothing is summed: each line is its own amount.

type Line = PaydayPlanView['lines'][number];

export function lineKey(line: Line): string {
  return line.budgetId ?? line.categoryId ?? line.tagId ?? '';
}

/** What each field starts with: the server's prefill for the line. */
export function initialTexts(
  lines: readonly Line[],
  locale: string,
): Record<string, string> {
  return Object.fromEntries(
    lines.map((line) => [
      lineKey(line),
      line.prefill.amountMinor === 0
        ? ''
        : formatMoneyInput(line.prefill, locale),
    ]),
  );
}

/** An amount that may be zero; null when the text is not an amount. */
function parseAmount(
  text: string,
  currency: string,
  locale: string,
): Money | null {
  if (text.trim() === '') return money(0, currency);
  try {
    const amount = parseMoney(text, currency, locale);
    return amount.amountMinor < 0 ? null : amount;
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
}

export type ConfirmResult =
  { ok: true; body: ConfirmPlanBody } | { ok: false; invalid: string[] };

export function toConfirmBody(
  lines: readonly Line[],
  texts: Readonly<Record<string, string>>,
  currency: string,
  locale: string,
  savings: ConfirmPlanBody['savings'],
): ConfirmResult {
  const invalid: string[] = [];
  const budgets: ConfirmPlanBody['budgets'] = [];
  for (const line of lines) {
    const key = lineKey(line);
    const amount = parseAmount(texts[key] ?? '', currency, locale);
    if (amount === null) {
      invalid.push(key);
      continue;
    }
    if (line.budgetId !== null)
      budgets.push({ budgetId: line.budgetId, amount });
    else if (line.categoryId !== null && amount.amountMinor > 0)
      budgets.push({ categoryId: line.categoryId, amount });
  }
  if (invalid.length > 0) return { ok: false, invalid };
  return {
    ok: true,
    body: { budgets, ...(savings === undefined ? {} : { savings }) },
  };
}
