import {
  formatMoney,
  money,
  type AccountView,
  type Money,
  type ReconcileResultView,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type Ref } from 'react';
import { FieldControl, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { amountExample } from '@/features/quick-entry/draft';
import { formatLongDay } from '@/features/ledger/format';
import { entryQueryKeys, reconcileAccount } from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import {
  newReconcileDraft,
  reconcileMode,
  toReconcileCheck,
  type ReconcileCheck,
  type ReconcileDraft,
  type ReconcileDraftErrors,
  type ReconcileMode,
} from './reconcile-draft.ts';

// Reconciling an account with the bank (FR-L9), default policy: compare
// first; a match is recorded, a difference is offered as one adjustment.
// A debt is entered and shown as the positive amount owed, as statements
// show it.

type Outcome = 'matched' | 'adjusted';

export function ReconcileFlow({
  account,
  today,
  locale,
  onDone,
  onCancel,
  onBusyChange,
}: {
  account: AccountView;
  today: string;
  locale: string;
  onDone: (outcome: Outcome) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  // Fixed while the dialog is open, even if an adjustment moves the balance.
  const [mode] = useState<ReconcileMode>(() => reconcileMode(account));
  const [draft, setDraft] = useState<ReconcileDraft>(() =>
    newReconcileDraft(today),
  );
  const [errors, setErrors] = useState<ReconcileDraftErrors>({});
  // The difference found for the values in the form; editing clears it.
  const [found, setFound] = useState<{
    check: ReconcileCheck;
    result: ReconcileResultView;
  } | null>(null);
  const balanceInput = useRef<HTMLInputElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLDivElement>(null);

  const reconcile = useMutation({
    mutationFn: (body: Parameters<typeof reconcileAccount>[1]) =>
      reconcileAccount(account.id, body),
    onSuccess: async (result) => {
      if (!result.reconciled) return;
      // An adjustment is an entry, possibly in new categories.
      await Promise.all(
        [...entryQueryKeys, ['categories']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const busy = reconcile.isPending;
  useEffect(() => {
    onBusyChange(busy);
    return () => {
      onBusyChange(false);
    };
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (found !== null) summary.current?.focus();
  }, [found]);

  const update = (patch: Partial<ReconcileDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
    setFound(null);
    if (reconcile.isError) reconcile.reset();
  };

  const compare = () => {
    const parsed = toReconcileCheck(draft, account, today, locale, mode);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      (parsed.errors.balance === undefined
        ? dateInput
        : balanceInput
      ).current?.focus();
      return;
    }
    const { check } = parsed;
    reconcile.mutate(check, {
      onSuccess: (result) => {
        if (result.reconciled) onDone('matched');
        else setFound({ check, result });
      },
    });
  };

  const adjust = () => {
    if (found === null) return;
    reconcile.mutate(
      {
        ...found.check,
        adjust: true,
        expectedDifference: found.result.difference,
      },
      {
        // A difference that dropped to zero meanwhile is recorded as a match.
        onSuccess: (result) => {
          onDone(result.adjustment === null ? 'matched' : 'adjusted');
        },
        // The ledger moved since the comparison: compare again.
        onError: () => {
          setFound(null);
        },
      },
    );
  };

  const example = amountExample(account.currency, locale);
  const errorText = (field: keyof ReconcileDraft) => {
    const key = errors[field];
    return key === undefined ? undefined : t(key, { example });
  };

  return (
    <form
      noValidate
      className="mt-4 grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (found === null) compare();
        else adjust();
      }}
    >
      <p>
        {mode === 'owed'
          ? t('accounts.reconcileFlow.owedIntro')
          : t('accounts.reconcileFlow.intro')}
      </p>
      <FieldControl
        label={
          mode === 'owed'
            ? t('accounts.reconcileFlow.owed', { currency: account.currency })
            : t('accounts.reconcileFlow.balance', {
                currency: account.currency,
              })
        }
        hint={
          mode === 'owed'
            ? t('accounts.reconcileFlow.owedHint')
            : t('accounts.reconcileFlow.balanceHint')
        }
        error={errorText('balance')}
      >
        {(props) => (
          <Input
            {...props}
            ref={balanceInput}
            name="balance"
            inputMode="decimal"
            autoComplete="off"
            className="h-11 text-base"
            value={draft.balance}
            onChange={(e) => {
              update({ balance: e.currentTarget.value });
            }}
          />
        )}
      </FieldControl>
      <FieldControl
        label={t('accounts.reconcileFlow.on')}
        error={errorText('on')}
      >
        {(props) => (
          <Input
            {...props}
            ref={dateInput}
            name="on"
            type="date"
            max={today}
            className="h-11 text-base"
            value={draft.on}
            onChange={(e) => {
              update({ on: e.currentTarget.value });
            }}
          />
        )}
      </FieldControl>

      {found === null ? null : (
        <Difference
          ref={summary}
          account={account}
          mode={mode}
          result={found.result}
          locale={locale}
        />
      )}

      {reconcile.isError ? (
        <FormError message={errorMessage(reconcile.error)} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {found === null
            ? busy
              ? t('accounts.reconcileFlow.checking')
              : t('accounts.reconcileFlow.check')
            : busy
              ? t('accounts.reconcileFlow.adjusting')
              : t('accounts.reconcileFlow.adjust')}
        </Button>
        <Button
          type="button"
          variant="outlined"
          disabled={busy}
          onClick={onCancel}
        >
          {t('accounts.cancel')}
        </Button>
      </div>
    </form>
  );
}

function Difference({
  ref,
  account,
  mode,
  result,
  locale,
}: {
  ref: Ref<HTMLDivElement>;
  account: AccountView;
  mode: ReconcileMode;
  result: ReconcileResultView;
  locale: string;
}) {
  const date = formatLongDay(result.on, locale);
  const { difference } = result;
  const amount = formatMoney(
    money(Math.abs(difference.amountMinor), difference.currency),
    locale,
  );
  // A lower balance than the ledger's is more owed on a debt.
  const less = difference.amountMinor < 0;
  const owed = mode === 'owed';
  const shown = (m: Money) => (owed ? money(-m.amountMinor, m.currency) : m);
  const summary = owed
    ? less
      ? t('accounts.reconcileFlow.owedMore', { amount, date })
      : t('accounts.reconcileFlow.owedLess', { amount, date })
    : less
      ? t('accounts.reconcileFlow.less', { amount, date })
      : t('accounts.reconcileFlow.more', { amount, date });
  const figure = (label: string, value: string) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-mono tabular-nums wrap-anywhere">{value}</dd>
    </div>
  );
  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-testid="reconcile-difference"
      className="grid gap-3 rounded-md bg-card p-4 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <p className="font-medium">{summary}</p>
      <dl className="grid gap-1">
        {figure(
          owed
            ? t('accounts.reconcileFlow.ledgerOwed')
            : t('accounts.reconcileFlow.ledger'),
          formatMoney(shown(result.ledgerBalance), locale),
        )}
        {figure(
          owed
            ? t('accounts.reconcileFlow.bankOwed')
            : t('accounts.reconcileFlow.bank'),
          formatMoney(shown(result.stated), locale),
        )}
        {figure(
          t('accounts.reconcileFlow.difference'),
          formatMoney(shown(difference), locale, {
            signDisplay: 'exceptZero',
          }),
        )}
      </dl>
      <p className="text-sm">
        {less
          ? t('accounts.reconcileFlow.adjustExpense', { amount, date })
          : t('accounts.reconcileFlow.adjustIncome', { amount, date })}{' '}
        {account.budgetGroup === 'on'
          ? `${t('accounts.reconcileFlow.onBudget')} `
          : ''}
        {t('accounts.reconcileFlow.undoHint')}
      </p>
    </div>
  );
}
