import type { ExchangeRateView, TodayView } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatLongDay } from '@/features/ledger/format';
import { useCurrencyOptions } from '@/lib/currency-options';
import { describeProblem, errorMessage } from '@/lib/problem';
import {
  createRate,
  deleteRate,
  invalidate,
  rateQueryKeys,
} from '@/lib/settings';
import { t } from '@/messages/t';
import { parseRate } from './bill-draft.ts';
import { Section } from './section.tsx';

function useRateChange<A, R>(run: (args: A) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await invalidate(queryClient, rateQueryKeys);
    },
  });
}

function RateForm({
  defaultCurrency,
  suggested,
  today,
  locale,
  onSaved,
}: {
  defaultCurrency: string;
  suggested: string | undefined;
  today: string;
  locale: string;
  onSaved: (message: string) => void;
}) {
  const [base, setBase] = useState(suggested ?? '');
  const [quote, setQuote] = useState(defaultCurrency);
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState(today);
  const [errors, setErrors] = useState<{
    base?: string;
    quote?: string;
    rate?: string;
  }>({});
  const currencies = useCurrencyOptions(locale);
  const save = useRateChange(createRate);
  const problem = save.isError ? describeProblem(save.error) : null;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseRate(rate);
    const next = {
      ...(base === '' ? { base: t('settings.rates.errors.base') } : {}),
      ...(base !== '' && base === quote
        ? { quote: t('settings.rates.errors.same') }
        : {}),
      ...(parsed === null ? { rate: t('settings.rates.errors.rate') } : {}),
    };
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first !== undefined || parsed === null) {
      const field = event.currentTarget.elements.namedItem(first ?? 'rate');
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    save.mutate(
      { base, quote, rate: parsed, asOf },
      {
        onSuccess: (saved) => {
          setRate('');
          onSaved(
            t('settings.rates.announce.saved', {
              base: saved.base,
              quote: saved.quote,
              rate: saved.rate,
            }),
          );
        },
      },
    );
  }

  const currencySelect = (
    name: 'base' | 'quote',
    value: string,
    set: (code: string) => void,
    props: object,
  ) => (
    <select
      {...props}
      name={name}
      value={value}
      className={selectClass}
      onChange={(e) => {
        set(e.currentTarget.value);
        setErrors({});
        if (save.isError) save.reset();
      }}
    >
      <option value="">{t('settings.rates.chooseCurrency')}</option>
      {currencies.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );

  return (
    <form className="mt-4 grid max-w-md gap-5" onSubmit={submit} noValidate>
      <FieldControl label={t('settings.rates.base')} error={errors.base}>
        {(props) => currencySelect('base', base, setBase, props)}
      </FieldControl>
      <FieldControl label={t('settings.rates.quote')} error={errors.quote}>
        {(props) => currencySelect('quote', quote, setQuote, props)}
      </FieldControl>
      <FieldControl
        label={
          base === '' || quote === ''
            ? t('settings.rates.rate')
            : t('settings.rates.rateOf', { base, quote })
        }
        error={errors.rate ?? problem?.fields.rate}
        hint={t('settings.rates.rateHint')}
      >
        {(props) => (
          <Input
            {...props}
            name="rate"
            value={rate}
            inputMode="decimal"
            autoComplete="off"
            className="h-11 text-base"
            onChange={(e) => {
              setRate(e.currentTarget.value);
              setErrors({});
              if (save.isError) save.reset();
            }}
          />
        )}
      </FieldControl>
      <FieldControl
        label={t('settings.rates.asOf')}
        hint={t('settings.rates.asOfHint')}
      >
        {(props) => (
          <Input
            {...props}
            type="date"
            name="asOf"
            value={asOf}
            required
            className="h-11 text-base"
            onChange={(e) => {
              setAsOf(e.currentTarget.value);
            }}
          />
        )}
      </FieldControl>
      <FormError message={problem?.message ?? null} />
      <Button
        type="submit"
        className="h-11 justify-self-start"
        disabled={save.isPending}
      >
        {save.isPending ? t('settings.saving') : t('settings.rates.add')}
      </Button>
    </form>
  );
}

function RateItem({
  rate,
  locale,
  onDeleted,
}: {
  rate: ExchangeRateView;
  locale: string;
  onDeleted: (message: string) => void;
}) {
  const labelId = useId();
  const remove = useRateChange(() => deleteRate(rate.id));
  const label = t('settings.rates.item', {
    base: rate.base,
    quote: rate.quote,
    rate: rate.rate,
  });
  const day = formatLongDay(rate.asOf, locale);
  return (
    <li
      aria-labelledby={labelId}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"
    >
      <span className="min-w-0 wrap-anywhere">
        <span id={labelId} className="font-mono tabular-nums">
          {label}
        </span>{' '}
        <span className="text-sm text-text-muted">
          {t('settings.rates.from', { day })}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {remove.isError ? (
          <span role="alert" className="text-sm font-medium text-negative">
            {errorMessage(remove.error)}
          </span>
        ) : null}
        <Button
          variant="outlined"
          size="dense"
          disabled={remove.isPending}
          onClick={() => {
            // The row is gone by the time the request settles, so its
            // mutate callbacks would not run; the promise still does.
            remove.mutateAsync().then(
              () => {
                document.getElementById('rates-title')?.focus();
                onDeleted(t('settings.rates.announce.deleted', { label }));
              },
              () => undefined,
            );
          }}
        >
          {t('settings.delete')}
          <span className="sr-only">
            {' '}
            {label}, {day}
          </span>
        </Button>
      </span>
    </li>
  );
}

// Manual exchange rates (ADR 0010, FR-X2): figures in the default currency
// use the latest rate dated on or before their day.
export function RatesSection({
  rates,
  today,
  defaultCurrency,
  locale,
}: {
  rates: readonly ExchangeRateView[];
  today: TodayView;
  defaultCurrency: string;
  locale: string;
}) {
  const [announcement, setAnnouncement] = useState('');
  return (
    <Section
      id="rates"
      title={t('settings.rates.title')}
      intro={t('settings.rates.intro', { currency: defaultCurrency })}
    >
      {today.missingRates.length === 0 ? null : (
        <p className="mt-4 flex gap-3 rounded-md bg-card p-3 text-sm">
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-negative"
          />
          {t('settings.rates.missing', {
            currencies: today.missingRates.join(', '),
            currency: defaultCurrency,
          })}
        </p>
      )}
      <RateForm
        defaultCurrency={defaultCurrency}
        suggested={today.missingRates[0]}
        today={today.today}
        locale={locale}
        onSaved={setAnnouncement}
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {rates.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          {t('settings.rates.none')}
        </p>
      ) : (
        <ul
          aria-label={t('settings.rates.listLabel')}
          className="mt-6 divide-y rounded-md bg-card px-4"
        >
          {rates.map((rate) => (
            <RateItem
              key={rate.id}
              rate={rate}
              locale={locale}
              onDeleted={setAnnouncement}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}
