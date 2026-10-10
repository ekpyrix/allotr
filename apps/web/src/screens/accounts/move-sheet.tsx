import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { AccountView, PoolView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { moveAccountToPool, poolQueryKeys } from '@/lib/budgets';
import { t } from '@/messages/t';
import { ChoiceField } from '../transactions/detail/fields.tsx';
import { movePools } from './accounts-model.ts';

/**
 * Moves one account into another pool from today. Moving between the Budget
 * and Savings kinds of pool changes what counts toward today's number, so
 * the sheet says so before it is confirmed.
 */
export function MoveSheet({
  account,
  pools,
  onClose,
}: {
  account: AccountView;
  pools: readonly PoolView[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const targets = movePools(account, pools);
  const [poolId, setPoolId] = useState('');
  const target = targets.find((p) => p.id === poolId);
  const move = useMutation({
    mutationFn: (id: string) => moveAccountToPool(account.id, id),
    onSuccess: () => {
      for (const queryKey of poolQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (target !== undefined) move.mutate(target.id);
  };

  // Whether the account counts toward today follows its pool.
  const effect =
    target === undefined || target.counts === (account.budgetGroup === 'on')
      ? null
      : target.counts
        ? t('accountsScreen.move.toOn')
        : t('accountsScreen.move.toOff');

  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('accountsScreen.move.title', { name: account.name })}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <p className="font-sans text-small text-text-muted">
          {targets.length === 0
            ? t('accountsScreen.move.noOther')
            : t('accountsScreen.move.intro')}
        </p>
        {targets.length === 0 ? null : (
          <ChoiceField
            label={t('accountsScreen.move.pool')}
            value={poolId}
            choices={targets.map((p) => ({ id: p.id, label: p.name }))}
            placeholder={t('accountsScreen.move.choose')}
            onChange={setPoolId}
          />
        )}
        {effect === null ? null : (
          <p className="font-sans text-small">{effect}</p>
        )}
        {move.isError ? (
          <p role="alert" className="text-small text-negative">
            {t('accountsScreen.move.failed')}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('accountsScreen.cancel')}
          </BracketButton>
          <PrimaryButton
            type="submit"
            isDisabled={target === undefined || move.isPending}
          >
            {move.isPending
              ? t('accountsScreen.move.saving')
              : t('accountsScreen.move.save')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}
