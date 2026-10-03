import { formatMoney, formatMoneyInput, type Money } from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { parseBillAmount } from '@/features/settings/bill-draft';
import {
  budgetQueryKeys,
  budgetsQuery,
  clearCoverOverride,
  coversQuery,
  setCoverOverride,
} from '@/lib/budgets';
import { ledgerSettingsQuery } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import { invalidate } from '@/lib/settings';
import { t } from '@/messages/t';
import { MoneyInput } from './money-input.tsx';

type Cover = NonNullable<
  ReturnType<typeof useCovers>['data']
>['covers'][number];

function useCovers() {
  return useQuery(coversQuery);
}

function SplitForm({
  cover,
  order,
  currency,
  locale,
  onDone,
}: {
  cover: Cover;
  order: readonly { id: string; name: string; kind: string }[];
  currency: string;
  locale: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const taken = new Map(cover.covers.map((c) => [c.source, c.amount]));
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      order.map((item) => {
        const amount = taken.get(item.id);
        return [
          item.id,
          amount === undefined ? '' : formatMoneyInput(amount, locale),
        ];
      }),
    ),
  );
  const [errors, setErrors] = useState<Record<string, true>>({});
  const [empty, setEmpty] = useState(false);
  const save = useMutation({
    mutationFn: (covers: { source: string; amount: Money }[]) =>
      setCoverOverride(cover.entryId, { covers }),
    onSuccess: async () => {
      await invalidate(queryClient, budgetQueryKeys);
      onDone();
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const covers: { source: string; amount: Money }[] = [];
    const bad: Record<string, true> = {};
    for (const item of order) {
      const text = values[item.id] ?? '';
      if (text.trim() === '') continue;
      const parsed = parseBillAmount(text, currency, locale);
      if (parsed.ok) covers.push({ source: item.id, amount: parsed.amount });
      else bad[item.id] = true;
    }
    setErrors(bad);
    setEmpty(covers.length === 0 && Object.keys(bad).length === 0);
    if (covers.length > 0 && Object.keys(bad).length === 0) save.mutate(covers);
  }

  return (
    <form className="mt-3 grid gap-3" noValidate onSubmit={submit}>
      <p className="text-body text-text-muted">
        {t('budget.entryCover.sheetIntro')}
      </p>
      {order.map((item) => (
        <MoneyInput
          key={item.id}
          label={item.kind === 'free' ? t('budget.cover.free') : item.name}
          name={`cover-${item.id}`}
          value={values[item.id] ?? ''}
          currency={currency}
          locale={locale}
          error={errors[item.id] === true ? 'invalid' : undefined}
          onChange={(value) => {
            setValues((current) => ({ ...current, [item.id]: value }));
          }}
        />
      ))}
      <FormError
        message={
          save.isError
            ? describeProblem(save.error).message
            : empty
              ? t('budget.entryCover.empty')
              : null
        }
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="dense" disabled={save.isPending}>
          {t('budget.entryCover.save')}
        </Button>
        <Button type="button" variant="outlined" size="dense" onClick={onDone}>
          {t('accounts.close')}
        </Button>
      </div>
    </form>
  );
}

/**
 * How an expense's shortfall was covered this period, with a way to change
 * the split. The split is a setting on the entry; no ledger line changes.
 */
export function EntryCover({
  entryId,
  locale,
}: {
  entryId: string;
  locale: string;
}) {
  const covers = useCovers();
  const settings = useQuery(ledgerSettingsQuery);
  const budgets = useQuery(budgetsQuery);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const reset = useMutation({
    mutationFn: () => clearCoverOverride(entryId),
    onSuccess: async () => {
      await invalidate(queryClient, budgetQueryKeys);
    },
  });
  const cover = covers.data?.covers.find((c) => c.entryId === entryId);
  if (
    cover === undefined ||
    budgets.data === undefined ||
    settings.data === undefined
  )
    return null;
  const has = cover.covers.length > 0 || cover.uncovered.amountMinor > 0;
  return (
    <section
      aria-label={t('budget.entryCover.title')}
      className="grid gap-1 rounded-md border border-outline-variant p-3"
    >
      <p className="text-title">{t('budget.entryCover.title')}</p>
      {has ? (
        <ul className="text-body">
          {cover.covers.map((c) => (
            <li key={c.source}>
              {t('budget.entryCover.from', {
                source: c.source === 'free' ? t('budget.cover.free') : c.name,
                amount: formatMoney(c.amount, locale),
              })}
            </li>
          ))}
          {cover.uncovered.amountMinor > 0 ? (
            <li>
              {t('budget.entryCover.uncovered', {
                amount: formatMoney(cover.uncovered, locale),
              })}
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-body">{t('budget.entryCover.none')}</p>
      )}
      <p className="text-caption text-text-muted">
        {cover.overridden
          ? t('budget.entryCover.chosen')
          : t('budget.entryCover.automatic')}
      </p>
      {editing ? (
        <SplitForm
          cover={cover}
          order={budgets.data.coverOrder}
          currency={settings.data.defaultCurrency}
          locale={locale}
          onDone={() => {
            setEditing(false);
          }}
        />
      ) : (
        <div className="mt-1 flex flex-wrap gap-2">
          {has || cover.overridden ? (
            <Button
              variant="outlined"
              size="dense"
              onClick={() => {
                setEditing(true);
              }}
            >
              {t('budget.entryCover.edit')}
            </Button>
          ) : null}
          {cover.overridden ? (
            <Button
              variant="text"
              size="dense"
              disabled={reset.isPending}
              onClick={() => {
                reset.mutate();
              }}
            >
              {t('budget.entryCover.reset')}
            </Button>
          ) : null}
        </div>
      )}
      {reset.isError ? (
        <FormError message={describeProblem(reset.error).message} />
      ) : null}
    </section>
  );
}
