import type { BudgetView, CategoryView } from '@allotr/shared';

// The add-budget form's rules. A budget is never planned on a category the
// user did not pick, and its name follows the category until they type one.

/** What a new budget is called: the typed name, else the category's. */
export function budgetName(
  typed: string,
  categoryId: string,
  categories: readonly CategoryView[],
): string {
  const name = typed.trim();
  if (name !== '') return name;
  return categories.find((c) => c.id === categoryId)?.name ?? '';
}

/** The category a budget counts, for its row; none for the Buffer or a tag. */
export function countedCategory(
  target: BudgetView['target'],
  categories: readonly CategoryView[],
): string | undefined {
  if (target.kind !== 'category') return undefined;
  return categories.find((c) => c.id === target.categoryId)?.name;
}

/** A budget started in the current period can still be deleted. */
export function canDelete(budget: BudgetView, periodFrom: string): boolean {
  return budget.target.kind !== 'buffer' && budget.startedOn >= periodFrom;
}
