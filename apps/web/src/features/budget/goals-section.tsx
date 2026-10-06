import {
  formatMoney,
  localDate,
  type AccountView,
  type GoalListView,
  type GoalView,
  type PoolListView,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LinearProgress } from '@/components/ui/progress';
import { formatLongDay } from '@/features/ledger/format';
import { Section } from '@/features/settings/section';
import {
  parseBillAmount,
  type AmountError,
} from '@/features/settings/bill-draft';
import { createGoal, poolQueryKeys, updateGoal } from '@/lib/budgets';
import { describeProblem } from '@/lib/problem';
import { invalidate } from '@/lib/settings';
import { t } from '@/messages/t';
import { MoneyInput } from './money-input.tsx';

function GoalRow({ goal, locale }: { goal: GoalView; locale: string }) {
  const queryClient = useQueryClient();
  const archive = useMutation({
    mutationFn: () => updateGoal(goal.id, { archived: true }),
    onSuccess: async () => {
      await invalidate(queryClient, poolQueryKeys);
    },
  });
  const share =
    goal.target.amountMinor === 0
      ? 0
      : (goal.saved.amountMinor / goal.target.amountMinor) * 100;
  return (
    <li className="border-b border-outline-variant py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body font-medium wrap-anywhere">{goal.name}</h3>
          <p className="text-caption text-text-muted">
            {goal.targetOn === null
              ? null
              : t('budget.goals.by', {
                  date: formatLongDay(localDate(goal.targetOn), locale),
                })}
          </p>
        </div>
        <Button
          variant="text"
          disabled={archive.isPending}
          aria-label={t('budget.goals.archiveLabel', { name: goal.name })}
          onClick={() => {
            archive.mutate();
          }}
        >
          {t('budget.goals.archive')}
        </Button>
      </div>
      <LinearProgress
        className="mt-2"
        value={share}
        label={t('budget.goals.progress', { name: goal.name })}
      />
      <p className="mt-1 font-mono text-body" data-testid="goal-saved">
        {t('budget.goals.saved', {
          saved: formatMoney(goal.saved, locale),
          target: formatMoney(goal.target, locale),
        })}
      </p>
      <p className="text-caption text-text-muted">
        {goal.reached
          ? t('budget.goals.reached')
          : t('budget.goals.remaining', {
              amount: formatMoney(goal.remaining, locale),
            })}
      </p>
      {goal.missingRates.length > 0 ? (
        <p className="text-caption text-text-muted">
          {t('budget.goals.missingRates', { currency: goal.target.currency })}
        </p>
      ) : null}
      {archive.isError ? (
        <FormError message={describeProblem(archive.error).message} />
      ) : null}
    </li>
  );
}

type Choice = { value: string; label: string };

/** Savings pools and savings accounts that have no goal yet. */
function choices(
  goals: GoalListView,
  pools: PoolListView,
  accounts: readonly AccountView[],
): Choice[] {
  const takenPools = new Set(goals.goals.map((g) => g.poolId));
  const takenAccounts = new Set(goals.goals.map((g) => g.accountId));
  const savings = new Set(
    pools.pools.filter((p) => p.kind === 'savings').map((p) => p.id),
  );
  return [
    ...pools.pools
      .filter((p) => savings.has(p.id) && !p.archived && !takenPools.has(p.id))
      .map((p) => ({
        value: `pool:${p.id}`,
        label: t('budget.goals.targetPool', { name: p.name }),
      })),
    ...accounts
      .filter(
        (a) => !a.archived && savings.has(a.poolId) && !takenAccounts.has(a.id),
      )
      .map((a) => ({ value: `account:${a.id}`, label: a.name })),
  ];
}

function AddGoal({
  options,
  currency,
  locale,
}: {
  options: readonly Choice[];
  currency: string;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [amountError, setAmountError] = useState<AmountError>();
  const add = useMutation({
    mutationFn: createGoal,
    onSuccess: async () => {
      setName('');
      setTarget('');
      setAmount('');
      setDate('');
      await invalidate(queryClient, poolQueryKeys);
    },
  });
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseBillAmount(amount, currency, locale);
    if (!parsed.ok) {
      setAmountError(parsed.error);
      return;
    }
    setAmountError(undefined);
    const [kind, id] = target.split(':');
    if (id === undefined) return;
    add.mutate({
      name: name.trim(),
      ...(kind === 'pool' ? { poolId: id } : { accountId: id }),
      target: parsed.amount,
      ...(date === '' ? {} : { targetOn: localDate(date) }),
    });
  }
  if (options.length === 0) {
    return (
      <p className="mt-4 text-caption text-text-muted">
        {t('budget.goals.none')}
      </p>
    );
  }
  return (
    <form className="mt-4 grid max-w-lg gap-3" onSubmit={submit} noValidate>
      <FieldControl label={t('budget.goals.newName')}>
        {(props) => (
          <Input
            {...props}
            name="goalName"
            value={name}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => {
              setName(e.currentTarget.value);
              if (add.isError) add.reset();
            }}
          />
        )}
      </FieldControl>
      <FieldControl label={t('budget.goals.target')}>
        {(props) => (
          <select
            {...props}
            name="goalTarget"
            value={target}
            className={selectClass}
            onChange={(e) => {
              setTarget(e.currentTarget.value);
            }}
          >
            <option value="">{t('budget.goals.targetPlaceholder')}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </FieldControl>
      <MoneyInput
        label={t('budget.goals.amount')}
        name="goalAmount"
        value={amount}
        currency={currency}
        locale={locale}
        error={amountError}
        onChange={setAmount}
      />
      <FieldControl label={t('budget.goals.date')}>
        {(props) => (
          <Input
            {...props}
            type="date"
            name="goalDate"
            value={date}
            onChange={(e) => {
              setDate(e.currentTarget.value);
            }}
          />
        )}
      </FieldControl>
      <div>
        <Button
          type="submit"
          disabled={add.isPending || name.trim() === '' || target === ''}
        >
          {t('budget.goals.add')}
        </Button>
      </div>
      <FormError
        message={add.isError ? describeProblem(add.error).message : null}
      />
    </form>
  );
}

/** Savings goals: earmarks on savings pools and accounts, with progress. */
export function GoalsSection({
  goals,
  pools,
  accounts,
  currency,
  locale,
}: {
  goals: GoalListView;
  pools: PoolListView;
  accounts: readonly AccountView[];
  currency: string;
  locale: string;
}) {
  return (
    <Section
      id="goals"
      title={t('budget.goals.title')}
      intro={t('budget.goals.intro')}
    >
      {goals.goals.length === 0 ? (
        <p className="mt-3 text-body text-text-muted">
          {t('budget.goals.empty')}
        </p>
      ) : (
        <ul className="mt-3 border-y border-outline-variant">
          {goals.goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} locale={locale} />
          ))}
        </ul>
      )}
      <AddGoal
        options={choices(goals, pools, accounts)}
        currency={currency}
        locale={locale}
      />
    </Section>
  );
}
