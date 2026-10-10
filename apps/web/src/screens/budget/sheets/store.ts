import { useSyncExternalStore } from 'react';

// Which of the budget sheets is open. Any sub-tab can open one with
// `openBudgetSheet`, and `<BudgetSheets />` (mounted once by a tab) shows it.

export type BudgetSheet = 'payday' | 'weekly-review';

let current: BudgetSheet | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function openBudgetSheet(sheet: BudgetSheet): void {
  current = sheet;
  emit();
}

export function closeBudgetSheet(): void {
  current = null;
  emit();
}

export function useOpenBudgetSheet(): BudgetSheet | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
    () => null,
  );
}
