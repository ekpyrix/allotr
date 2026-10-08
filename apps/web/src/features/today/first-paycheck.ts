import type { AccountView, CategoryView } from '@allotr/shared';

/**
 * Whether to offer recording a first paycheck: the open cycle was not
 * opened by one, and there is an on-budget account and a paycheck category
 * to record it in. A paycheck is what opens cycles (docs/domain.md
 * "Cycles"); there is no other way.
 */
export function needsFirstPaycheck(
  openedBy: string | null,
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): boolean {
  return (
    openedBy === null &&
    accounts.some((a) => !a.archived && a.budgetGroup === 'on') &&
    categories.some(
      (c) => c.kind === 'income' && c.isPaycheck && c.mergedIntoId === null,
    )
  );
}
