import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { MoneyError, parseMoney, type BudgetStatusView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import {
  budgetQueryKeys,
  clearCoverOverride,
  setCoverOverride,
} from '@/lib/budgets';
import { t } from '@/messages/t';
import { ChoiceField, TextField } from './fields.tsx';
import type { CoverLine } from './detail-model.ts';

/**
 * Chooses which source covers what the entry's own budget could not. The
 * server caps the amount at what the source has and sends any rest down
 * the cover order, so this only reads the amount typed.
 */
export function CoverSheet({
  entryId,
  line,
  order,
  onClose,
}: {
  entryId: string;
  line: CoverLine;
  order: BudgetStatusView['coverOrder'];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState(line.covers[0]?.source ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | undefined>();
  const currency = line.amount.currency;

  const done = {
    onSuccess: () => {
      for (const queryKey of budgetQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  };
  const save = useMutation({
    mutationFn: (value: ReturnType<typeof parseMoney>) =>
      setCoverOverride(entryId, { covers: [{ source, amount: value }] }),
    ...done,
  });
  const clear = useMutation({
    mutationFn: () => clearCoverOverride(entryId),
    ...done,
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (source === '') {
      setError(t('transactionDetail.coverSheet.chooseSource'));
      return;
    }
    let value: ReturnType<typeof parseMoney>;
    try {
      value = parseMoney(amount, currency, 'en');
    } catch (caught) {
      if (!(caught instanceof MoneyError)) throw caught;
      setError(t('quickEntry.errors.amountInvalid', { example: '12.50' }));
      return;
    }
    if (value.amountMinor <= 0) {
      setError(t('quickEntry.errors.amountPositive'));
      return;
    }
    setError(undefined);
    save.mutate(value);
  };

  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('transactionDetail.coverSheet.title')}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <p className="font-sans text-small text-text-muted">
          {t('transactionDetail.coverSheet.intro')}
        </p>
        <ChoiceField
          label={t('transactionDetail.coverSheet.source')}
          value={source}
          choices={order.map((o) => ({ id: o.id, label: o.name }))}
          placeholder={t('transactionDetail.coverSheet.chooseSource')}
          onChange={setSource}
        />
        <TextField
          label={t('transactionDetail.coverSheet.amount')}
          value={amount}
          onChange={setAmount}
          error={error}
          inputMode="decimal"
        />
        {save.isError || clear.isError ? (
          <p role="alert" className="text-small text-negative">
            {t('transactionDetail.actionFailed')}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {line.overridden ? (
            <BracketButton
              isDisabled={clear.isPending}
              onPress={() => {
                clear.mutate();
              }}
            >
              {t('transactionDetail.coverSheet.clear')}
            </BracketButton>
          ) : null}
          <PrimaryButton type="submit" isDisabled={save.isPending}>
            {save.isPending
              ? t('transactionDetail.coverSheet.saving')
              : t('transactionDetail.coverSheet.save')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}
