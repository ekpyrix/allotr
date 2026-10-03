import {
  formatMoney,
  type PoolKind,
  type PoolListView,
  type PoolView,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Section } from '@/features/settings/section';
import { createPool, poolQueryKeys, updatePool } from '@/lib/budgets';
import { describeProblem } from '@/lib/problem';
import { invalidate } from '@/lib/settings';
import { t } from '@/messages/t';

function PoolRow({
  pool,
  locale,
  countSavingsInDaily,
}: {
  pool: PoolView;
  locale: string;
  countSavingsInDaily: boolean;
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (countsTowardDaily: boolean) =>
      updatePool(pool.id, { countsTowardDaily }),
    onSuccess: async () => {
      await invalidate(queryClient, poolQueryKeys);
    },
  });
  const switchId = `pool-${pool.id}-counts`;
  const blocked = pool.kind === 'savings' && !countSavingsInDaily;
  return (
    <li className="border-b border-outline-variant py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body font-medium wrap-anywhere">{pool.name}</h3>
          <p className="text-caption text-text-muted">
            {t(`budget.pools.kinds.${pool.kind}`)} ·{' '}
            {t('budget.pools.accounts', { count: pool.accountIds.length })}
          </p>
        </div>
        <p className="font-mono text-body" data-testid="pool-balance">
          {formatMoney(pool.balance.amount, locale)}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Switch
          id={switchId}
          checked={pool.countsTowardDaily}
          disabled={toggle.isPending}
          onCheckedChange={(next) => {
            toggle.mutate(next);
          }}
        />
        <label htmlFor={switchId} className="text-body">
          {t('budget.pools.counts')}
        </label>
      </div>
      <p className="mt-1 text-caption text-text-muted">
        {pool.counts
          ? t('budget.pools.inDaily')
          : blocked && pool.countsTowardDaily
            ? t('budget.pools.savingsOff')
            : t('budget.pools.notInDaily')}
      </p>
      {toggle.isError ? (
        <FormError message={describeProblem(toggle.error).message} />
      ) : null}
    </li>
  );
}

function AddPool() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PoolKind>('savings');
  const add = useMutation({
    mutationFn: createPool,
    onSuccess: async () => {
      setName('');
      await invalidate(queryClient, poolQueryKeys);
    },
  });
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    add.mutate({ name: name.trim(), kind });
  }
  return (
    <form
      className="mt-4 flex max-w-lg flex-wrap items-end gap-3"
      onSubmit={submit}
      noValidate
    >
      <div className="min-w-40 flex-1">
        <FieldControl label={t('budget.pools.newName')}>
          {(props) => (
            <Input
              {...props}
              name="poolName"
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
      </div>
      <FieldControl label={t('budget.pools.newKind')}>
        {(props) => (
          <select
            {...props}
            name="poolKind"
            value={kind}
            className={selectClass}
            onChange={(e) => {
              setKind(
                e.currentTarget.value === 'spending' ? 'spending' : 'savings',
              );
            }}
          >
            <option value="savings">{t('budget.pools.kinds.savings')}</option>
            <option value="spending">{t('budget.pools.kinds.spending')}</option>
          </select>
        )}
      </FieldControl>
      <Button type="submit" disabled={add.isPending || name.trim() === ''}>
        {t('budget.pools.add')}
      </Button>
      <FormError
        message={add.isError ? describeProblem(add.error).message : null}
      />
    </form>
  );
}

/** Pools: groups of accounts, and whether each counts toward the daily number. */
export function PoolsSection({
  list,
  locale,
}: {
  list: PoolListView;
  locale: string;
}) {
  return (
    <Section
      id="pools"
      title={t('budget.pools.title')}
      intro={t('budget.pools.intro')}
    >
      <ul className="mt-3 border-y border-outline-variant">
        {list.pools.map((pool) => (
          <PoolRow
            key={pool.id}
            pool={pool}
            locale={locale}
            countSavingsInDaily={list.countSavingsInDaily}
          />
        ))}
      </ul>
      <AddPool />
    </Section>
  );
}
