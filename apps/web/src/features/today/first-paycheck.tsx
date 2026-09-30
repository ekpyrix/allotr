import type { AccountView, CategoryView } from '@allotr/shared';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useQuickEntry } from '@/features/quick-entry/quick-entry-provider';
import { t } from '@/messages/t';

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

// Opens the entry form as a paycheck: amount, date and account, saved
// through the same endpoint as any entry.
export function FirstPaycheck() {
  const heading = useId();
  const quickEntry = useQuickEntry();
  return (
    <section aria-labelledby={heading}>
      <Card className="grid gap-3">
        <h2 id={heading} className="text-title">
          {t('today.firstPaycheck.title')}
        </h2>
        <p className="max-w-prose text-body">
          {t('today.firstPaycheck.intro')}
        </p>
        <Button
          className="w-fit"
          onClick={(event) => {
            quickEntry.open(event.currentTarget, 'paycheck');
          }}
        >
          {t('today.firstPaycheck.action')}
        </Button>
      </Card>
    </section>
  );
}
