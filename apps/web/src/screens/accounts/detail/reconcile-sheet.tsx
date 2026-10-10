import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { AccountView, ReconcileResultView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import {
  newReconcileDraft,
  reconcileMode,
  toReconcileCheck,
  type ReconcileCheck,
  type ReconcileDraft,
  type ReconcileDraftErrors,
} from '@/features/accounts/reconcile-draft';
import { formatLongDay } from '@/features/ledger/format';
import { formatMoney } from '@/lib/format-money';
import { entryQueryKeys, reconcileAccount, todayQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { TextField } from '@/screens/transactions/detail/fields.tsx';
import { reconcileOutcome } from './detail-model.ts';

const locale = 'en';

/**
 * Compares the bank's balance with the ledger's (FR-L9). The server compares
 * and posts; a match is recorded at once, a difference is shown and can be
 * adjusted with an Unrecorded entry that the user can undo like any other.
 */
export function ReconcileSheet({
  account,
  open,
  onClose,
}: {
  account: AccountView;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const today = useQuery(todayQuery).data?.today;
  const mode = reconcileMode(account);
  const [draft, setDraft] = useState<ReconcileDraft | undefined>();
  const [errors, setErrors] = useState<ReconcileDraftErrors>({});
  const [checked, setChecked] = useState<
    { check: ReconcileCheck; result: ReconcileResultView } | undefined
  >();
  const [adjusted, setAdjusted] = useState(false);

  const form = draft ?? newReconcileDraft(today ?? '');
  const refresh = () => {
    for (const queryKey of entryQueryKeys)
      void queryClient.invalidateQueries({ queryKey });
  };

  const compare = useMutation({
    mutationFn: (check: ReconcileCheck) => reconcileAccount(account.id, check),
    onSuccess: (result, check) => {
      setChecked({ check, result });
      if (result.reconciled) refresh();
    },
  });
  const adjust = useMutation({
    mutationFn: ({
      check,
      result,
    }: {
      check: ReconcileCheck;
      result: ReconcileResultView;
    }) =>
      reconcileAccount(account.id, {
        ...check,
        adjust: true,
        expectedDifference: result.difference,
      }),
    onSuccess: () => {
      setAdjusted(true);
      refresh();
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (today === undefined) return;
    const parsed = toReconcileCheck(form, account, today, locale, mode);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    compare.mutate(parsed.check);
  };

  const error = (key: keyof ReconcileDraftErrors) => {
    const message = errors[key];
    return message === undefined ? undefined : t(message, { example: '12.50' });
  };

  const outcome =
    checked === undefined ? undefined : reconcileOutcome(checked.result, mode);
  const fmt = (m: Parameters<typeof formatMoney>[0]) =>
    formatMoney(m, 'symbol', locale);

  return (
    <Sheet
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('accounts.reconcileFlow.title', { name: account.name })}
      closeLabel={t('accounts.close')}
    >
      {checked === undefined || outcome === undefined ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
          <p className="font-sans text-small text-text-muted">
            {mode === 'owed'
              ? t('accounts.reconcileFlow.owedIntro')
              : t('accounts.reconcileFlow.intro')}
          </p>
          <TextField
            label={
              mode === 'owed'
                ? t('accounts.reconcileFlow.owed', {
                    currency: account.currency,
                  })
                : t('accounts.reconcileFlow.balance', {
                    currency: account.currency,
                  })
            }
            value={form.balance}
            onChange={(balance) => {
              setDraft({ ...form, balance });
            }}
            error={error('balance')}
            inputMode="decimal"
            autoFocus
          />
          <p className="-mt-2 text-tiny text-text-muted">
            {mode === 'owed'
              ? t('accounts.reconcileFlow.owedHint')
              : t('accounts.reconcileFlow.balanceHint')}
          </p>
          <TextField
            label={t('accounts.reconcileFlow.on')}
            value={form.on}
            onChange={(on) => {
              setDraft({ ...form, on });
            }}
            error={error('on')}
            placeholder="YYYY-MM-DD"
          />
          {compare.isError ? (
            <p role="alert" className="text-small text-negative">
              {t('accountDetail.reconcileSheet.failed')}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <BracketButton onPress={onClose}>
              {t('accounts.cancel')}
            </BracketButton>
            <PrimaryButton
              type="submit"
              isDisabled={compare.isPending || today === undefined}
            >
              {compare.isPending
                ? t('accounts.reconcileFlow.checking')
                : t('accounts.reconcileFlow.check')}
            </PrimaryButton>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {outcome.kind === 'match' ? (
            <p role="status" className="font-sans text-small">
              {t('accounts.announce.reconciled', { name: account.name })}
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
                <dt className="text-text-muted">
                  {mode === 'owed'
                    ? t('accounts.reconcileFlow.ledgerOwed')
                    : t('accounts.reconcileFlow.ledger')}
                </dt>
                <dd className="num">{fmt(outcome.ledger)}</dd>
                <dt className="text-text-muted">
                  {mode === 'owed'
                    ? t('accounts.reconcileFlow.bankOwed')
                    : t('accounts.reconcileFlow.bank')}
                </dt>
                <dd className="num">{fmt(outcome.bank)}</dd>
                <dt className="text-text-muted">
                  {t('accounts.reconcileFlow.difference')}
                </dt>
                <dd className="num">{fmt(outcome.amount)}</dd>
              </dl>
              <p
                role={adjusted ? undefined : 'status'}
                className="font-sans text-small"
              >
                {adjusted
                  ? t('accounts.announce.adjusted', { name: account.name })
                  : t(`accounts.reconcileFlow.${outcome.says}`, {
                      amount: fmt(outcome.amount),
                      date: formatLongDay(checked.result.on, locale),
                    })}
              </p>
              {adjusted ? null : (
                <>
                  <p className="font-sans text-small text-text-muted">
                    {t(
                      outcome.adjust === 'expense'
                        ? 'accounts.reconcileFlow.adjustExpense'
                        : 'accounts.reconcileFlow.adjustIncome',
                      {
                        amount: fmt(outcome.amount),
                        date: formatLongDay(checked.result.on, locale),
                      },
                    )}{' '}
                    {account.budgetGroup === 'on'
                      ? t('accounts.reconcileFlow.onBudget')
                      : null}{' '}
                    {t('accounts.reconcileFlow.undoHint')}
                  </p>
                  {adjust.isError ? (
                    <p role="alert" className="text-small text-negative">
                      {t('accountDetail.reconcileSheet.adjustFailed')}
                    </p>
                  ) : null}
                </>
              )}
            </>
          )}
          <div className="flex items-center justify-end gap-2">
            {outcome.kind === 'difference' && !adjusted ? (
              <>
                <BracketButton
                  onPress={() => {
                    setChecked(undefined);
                    adjust.reset();
                  }}
                >
                  {t('accountDetail.reconcileSheet.again')}
                </BracketButton>
                <PrimaryButton
                  isDisabled={adjust.isPending}
                  onPress={() => {
                    adjust.mutate(checked);
                  }}
                >
                  {adjust.isPending
                    ? t('accounts.reconcileFlow.adjusting')
                    : t('accounts.reconcileFlow.adjust')}
                </PrimaryButton>
              </>
            ) : (
              <PrimaryButton onPress={onClose}>
                {t('accounts.close')}
              </PrimaryButton>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
