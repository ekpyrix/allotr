import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BudgetView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { budgetQueryKeys, deleteBudget, endBudget } from '@/lib/budgets';
import { t } from '@/messages/t';

/** Confirms ending a budget from this period, or deleting one outright. */
export function BudgetConfirmSheet({
  action,
  budget,
  onClose,
}: {
  action: 'end' | 'delete';
  budget: BudgetView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: () =>
      action === 'end' ? endBudget(budget.id) : deleteBudget(budget.id),
    onSuccess: () => {
      for (const queryKey of budgetQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });
  const key = action === 'end' ? 'end' : 'delete';
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t(`budgetBudgets.confirm.${key}Title`, { name: budget.name })}
      closeLabel={t('quickEntry.close')}
    >
      <div className="flex flex-col gap-3 p-3">
        <p className="font-sans text-small text-text-muted">
          {t(`budgetBudgets.confirm.${key}Body`)}
        </p>
        {run.isError ? (
          <p role="alert" className="text-small text-negative">
            {t('budgetBudgets.confirm.failed')}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('budgetBudgets.cancel')}
          </BracketButton>
          <PrimaryButton
            isDisabled={run.isPending}
            onPress={() => {
              run.mutate();
            }}
          >
            {run.isPending
              ? t('budgetBudgets.confirm.working')
              : t(`budgetBudgets.confirm.${key}Action`)}
          </PrimaryButton>
        </div>
      </div>
    </Sheet>
  );
}
