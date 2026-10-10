import { PaydaySheet } from './payday-sheet.tsx';
import { closeBudgetSheet, useOpenBudgetSheet } from './store.ts';
import { WeeklyReviewSheet } from './weekly-review-sheet.tsx';

/** The payday plan and weekly review sheets; mount once per screen. */
export function BudgetSheets() {
  const open = useOpenBudgetSheet();
  return (
    <>
      <PaydaySheet open={open === 'payday'} onClose={closeBudgetSheet} />
      <WeeklyReviewSheet
        open={open === 'weekly-review'}
        onClose={closeBudgetSheet}
      />
    </>
  );
}
