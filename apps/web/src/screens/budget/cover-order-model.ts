import {
  MoneyError,
  parseMoney,
  type BudgetView,
  type CoverPreviewBody,
} from '@allotr/shared';

/**
 * The order after dropping `keys` (kept in their current order) before or
 * after `target`. A drop onto the dragged rows themselves changes nothing.
 */
export function reorder(
  list: readonly string[],
  keys: ReadonlySet<string>,
  target: string,
  position: 'before' | 'after',
): string[] {
  if (keys.has(target)) return [...list];
  const moved = list.filter((id) => keys.has(id));
  const rest = list.filter((id) => !keys.has(id));
  const at = rest.indexOf(target);
  if (at < 0) return [...list];
  rest.splice(position === 'before' ? at : at + 1, 0, ...moved);
  return rest;
}

/** The category a budget counts, or undefined for the Buffer and tags. */
export function budgetCategory(budget: BudgetView): string | undefined {
  return budget.target.kind === 'category'
    ? budget.target.categoryId
    : undefined;
}

/**
 * The preview request for what was typed, or null until it is complete:
 * a budget on a category, an account and a positive amount in that
 * account's currency. Parsing only; the server works out who covers it.
 */
export function previewRequest(input: {
  budget: BudgetView | undefined;
  accountId: string;
  currency: string | undefined;
  amount: string;
}): CoverPreviewBody | null {
  const categoryId =
    input.budget === undefined ? undefined : budgetCategory(input.budget);
  if (categoryId === undefined || input.accountId === '') return null;
  if (input.currency === undefined || input.amount.trim() === '') return null;
  try {
    const amount = parseMoney(input.amount, input.currency, 'en');
    if (amount.amountMinor <= 0) return null;
    return { accountId: input.accountId, amount, categoryId };
  } catch (caught) {
    if (caught instanceof MoneyError) return null;
    throw caught;
  }
}
