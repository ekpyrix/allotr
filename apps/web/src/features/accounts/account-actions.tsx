import { formatMoney, type AccountView } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  archiveAccount,
  entryQueryKeys,
  switchBudgetGroup,
  type Settle,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import { transferTargets } from './groups.ts';

// Moving an account on or off budget, and archiving it (FR-L2, FR-L8).
// Both write entries (a budget switch, a transfer or write-off), so every
// view that shows money refetches.

function useLedgerMutation<Input>(
  mutationFn: (input: Input) => Promise<unknown>,
  onBusyChange: (busy: boolean) => void,
) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all(
        entryQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const busy = mutation.isPending;
  useEffect(() => {
    onBusyChange(busy);
    return () => {
      onBusyChange(false);
    };
  }, [busy, onBusyChange]);
  return mutation;
}

export function budgetTitle(account: AccountView): string {
  return account.budgetGroup === 'on'
    ? t('accounts.budget.offTitle', { name: account.name })
    : t('accounts.budget.onTitle', { name: account.name });
}

export function BudgetSwitch({
  account,
  locale,
  onDone,
  onCancel,
  onBusyChange,
}: {
  account: AccountView;
  locale: string;
  onDone: () => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const to = account.budgetGroup === 'on' ? 'off' : 'on';
  const move = useLedgerMutation(
    () => switchBudgetGroup(account.id, to),
    onBusyChange,
  );
  const amount = formatMoney(account.balance, locale);
  return (
    <div className="mt-4 grid gap-5">
      <p>
        {to === 'off'
          ? t('accounts.budget.off', { amount })
          : t('accounts.budget.on', { amount })}
      </p>
      {move.isError ? <FormError message={errorMessage(move.error)} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={move.isPending}
          onClick={() => {
            move.mutate(undefined, { onSuccess: onDone });
          }}
        >
          {move.isPending
            ? t('accounts.budget.saving')
            : to === 'off'
              ? t('accounts.budget.confirmOff')
              : t('accounts.budget.confirmOn')}
        </Button>
        <Button variant="outline" disabled={move.isPending} onClick={onCancel}>
          {t('accounts.cancel')}
        </Button>
      </div>
    </div>
  );
}

type Method = Settle['method'];

export function ArchiveFlow({
  account,
  accounts,
  locale,
  onDone,
  onCancel,
  onBusyChange,
}: {
  account: AccountView;
  accounts: readonly AccountView[];
  locale: string;
  onDone: () => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const targets = transferTargets(account, accounts);
  const empty = account.balance.amountMinor === 0;
  const [method, setMethod] = useState<Method>(
    targets.length > 0 ? 'transfer' : 'write_off',
  );
  const [toAccountId, setToAccountId] = useState(targets[0]?.id ?? '');
  const methodName = useId();
  const archive = useLedgerMutation(
    (settle: Settle | undefined) => archiveAccount(account.id, settle),
    onBusyChange,
  );
  const amount = formatMoney(account.balance, locale);
  const settle: Settle | undefined = empty
    ? undefined
    : method === 'transfer'
      ? { method, toAccountId }
      : { method };

  return (
    <div className="mt-4 grid gap-5">
      <p>
        {empty
          ? t('accounts.archiveFlow.empty')
          : t('accounts.archiveFlow.balance', { amount })}
      </p>

      {empty ? null : (
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">
            {t('accounts.archiveFlow.how')}
          </legend>
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('accounts.archiveFlow.noTargets', {
                currency: account.currency,
              })}
            </p>
          ) : (
            <label className="flex cursor-pointer gap-3">
              <input
                type="radio"
                name={methodName}
                value="transfer"
                checked={method === 'transfer'}
                onChange={() => {
                  if (archive.isError) archive.reset();
                  setMethod('transfer');
                }}
                className="mt-1 accent-primary"
              />
              {t('accounts.archiveFlow.transfer')}
            </label>
          )}
          {method === 'transfer' && targets.length > 0 ? (
            <div className="ps-7">
              <FieldControl label={t('accounts.archiveFlow.transferTo')}>
                {(props) => (
                  <select
                    {...props}
                    name="toAccountId"
                    className={selectClass}
                    value={toAccountId}
                    onChange={(e) => {
                      if (archive.isError) archive.reset();
                      setToAccountId(e.currentTarget.value);
                    }}
                  >
                    {targets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </FieldControl>
            </div>
          ) : null}
          <label className="flex cursor-pointer gap-3">
            <input
              type="radio"
              name={methodName}
              value="write_off"
              checked={method === 'write_off'}
              onChange={() => {
                if (archive.isError) archive.reset();
                setMethod('write_off');
              }}
              className="mt-1 accent-primary"
            />
            <span className="grid gap-0.5">
              <span>{t('accounts.archiveFlow.writeOff')}</span>
              <span className="text-sm text-muted-foreground">
                {t('accounts.archiveFlow.writeOffHint', { amount })}
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {archive.isError ? (
        <FormError message={errorMessage(archive.error)} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={archive.isPending}
          onClick={() => {
            archive.mutate(settle, { onSuccess: onDone });
          }}
        >
          {archive.isPending
            ? t('accounts.archiveFlow.saving')
            : empty
              ? t('accounts.archiveFlow.confirm')
              : method === 'transfer'
                ? t('accounts.archiveFlow.confirmTransfer')
                : t('accounts.archiveFlow.confirmWriteOff')}
        </Button>
        <Button
          variant="outline"
          disabled={archive.isPending}
          onClick={onCancel}
        >
          {t('accounts.cancel')}
        </Button>
      </div>
    </div>
  );
}
