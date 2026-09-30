import { formatMoney, type AccountView } from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  archiveAccount,
  archiveImpactQuery,
  entryQueryKeys,
  switchBudgetGroup,
  type Settle,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import { DigitRoller } from '@/motion/digit-roller';
import { archiveWarning, type ArchiveWarning } from './archive-impact.ts';
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
        <Button variant="outlined" disabled={move.isPending} onClick={onCancel}>
          {t('accounts.cancel')}
        </Button>
      </div>
    </div>
  );
}

type Method = Settle['method'];

// Left today before and after, the after figure rolling in from the
// before one (spec §11.3). Both come from the server.
function BeforeAfter({
  warning,
  locale,
}: {
  warning: ArchiveWarning;
  locale: string;
}) {
  const before = formatMoney(warning.before, locale);
  const after = formatMoney(warning.after, locale);
  const [shown, setShown] = useState(before);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShown(after);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [after]);
  return (
    <p className="grid gap-1 rounded-lg bg-card p-4">
      <span className="text-label text-text-muted">
        {t('accounts.archiveFlow.leftToday')}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 font-mono text-title-lg tabular-nums">
        <span className="text-text-muted">{before}</span>
        <span aria-hidden="true">→</span>
        <span className="sr-only">{t('accounts.archiveFlow.becomes')}</span>
        <DigitRoller value={shown} label={after} />
      </span>
    </p>
  );
}

function warningText(
  warning: ArchiveWarning,
  amount: string,
  locale: string,
): string {
  const drop = formatMoney(warning.drop, locale);
  switch (warning.kind) {
    case 'write_off':
      return t('accounts.archiveFlow.impact.writeOff', { drop });
    case 'savings':
      return t('accounts.archiveFlow.impact.savings', {
        amount,
        target: warning.target.name,
        drop,
      });
    case 'transfer':
      return t('accounts.archiveFlow.impact.transfer', { drop });
  }
}

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
  const impactId = useId();
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
  // Archiving never lowers today's figure without saying so (FR-L8): the
  // drop comes from the server's projection, and confirming waits for it.
  const impact = useQuery({
    ...archiveImpactQuery(account.id),
    enabled: !empty,
  });
  const warning =
    impact.data === undefined
      ? null
      : archiveWarning(impact.data, account, settle, accounts);
  const impactText = empty
    ? null
    : impact.isPending
      ? t('accounts.archiveFlow.impact.loading')
      : impact.isError
        ? t('accounts.archiveFlow.impact.failed')
        : warning === null
          ? null
          : warningText(warning, amount, locale);

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
            <p className="text-sm text-text-muted">
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
              <span className="text-sm text-text-muted">
                {t('accounts.archiveFlow.writeOffHint', { amount })}
              </span>
            </span>
          </label>
        </fieldset>
      )}

      <p id={impactId} aria-live="polite" className="empty:hidden">
        {impactText}
      </p>
      {warning === null ? null : (
        <BeforeAfter warning={warning} locale={locale} />
      )}

      {archive.isError ? (
        <FormError message={errorMessage(archive.error)} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={archive.isPending || (!empty && impact.isPending)}
          aria-describedby={impactText === null ? undefined : impactId}
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
          variant="outlined"
          disabled={archive.isPending}
          onClick={onCancel}
        >
          {t('accounts.cancel')}
        </Button>
      </div>
    </div>
  );
}
