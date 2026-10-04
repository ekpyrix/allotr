import {
  entryTimesSchema,
  type EntryTimes,
  type LedgerSettingsView,
  type TodayView,
  type UpdateLedgerSettingsBody,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatLongDay } from '@/features/ledger/format';
import { useCurrencyOptions } from '@/lib/currency-options';
import { describeProblem } from '@/lib/problem';
import {
  figureQueryKeys,
  invalidate,
  updateLedgerSettings,
} from '@/lib/settings';
import { t } from '@/messages/t';
import { localeSample, timeZoneOptions } from './region.ts';
import { PaydayRuleFields } from './payday-rule.tsx';
import { Section } from './section.tsx';

function useSaveLedgerSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateLedgerSettings,
    onSuccess: async () => {
      await invalidate(queryClient, figureQueryKeys);
    },
  });
}

function LedgerForm({ settings }: { settings: LedgerSettingsView }) {
  const [locale, setLocale] = useState(settings.locale);
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [currency, setCurrency] = useState<string>(settings.defaultCurrency);
  const [entryTimes, setEntryTimes] = useState<EntryTimes>(settings.entryTimes);
  const [saved, setSaved] = useState(false);
  const save = useSaveLedgerSettings();
  const zones = useMemo(() => timeZoneOptions(settings.timeZone), [settings]);
  const currencies = useCurrencyOptions(settings.locale);
  const example = localeSample(locale.trim(), currency);
  const problem = save.isError ? describeProblem(save.error) : null;

  const changed = (): void => {
    setSaved(false);
    if (save.isError) save.reset();
  };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: UpdateLedgerSettingsBody = {
      ...(locale.trim() === settings.locale ? {} : { locale: locale.trim() }),
      ...(timeZone === settings.timeZone ? {} : { timeZone }),
      ...(currency === settings.defaultCurrency
        ? {}
        : { defaultCurrency: currency }),
      ...(entryTimes === settings.entryTimes ? {} : { entryTimes }),
    };
    if (Object.keys(body).length === 0) {
      setSaved(true);
      return;
    }
    save.mutate(body, {
      onSuccess: (next) => {
        setLocale(next.locale);
        setTimeZone(next.timeZone);
        setSaved(true);
      },
    });
  }

  return (
    <form className="mt-4 grid max-w-md gap-5" onSubmit={submit} noValidate>
      <FieldControl
        label={t('settings.ledger.locale')}
        error={problem?.fields.locale}
        hint={
          example === null
            ? t('settings.ledger.localeUnknown')
            : t('settings.ledger.localeSample', { sample: example })
        }
      >
        {(props) => (
          <Input
            {...props}
            name="locale"
            value={locale}
            autoComplete="off"
            spellCheck={false}
            required
            className="h-11 text-base"
            onChange={(e) => {
              setLocale(e.currentTarget.value);
              changed();
            }}
          />
        )}
      </FieldControl>
      <FieldControl
        label={t('settings.ledger.timeZone')}
        error={problem?.fields.timeZone}
      >
        {(props) => (
          <select
            {...props}
            name="timeZone"
            value={timeZone}
            className={selectClass}
            onChange={(e) => {
              setTimeZone(e.currentTarget.value);
              changed();
            }}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        )}
      </FieldControl>
      <FieldControl
        label={t('settings.ledger.currency')}
        hint={t('settings.ledger.currencyHint')}
      >
        {(props) => (
          <select
            {...props}
            name="defaultCurrency"
            value={currency}
            className={selectClass}
            onChange={(e) => {
              setCurrency(e.currentTarget.value);
              changed();
            }}
          >
            {currencies.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </FieldControl>
      <FieldControl
        label={t('settings.ledger.entryTimes')}
        hint={t('settings.ledger.entryTimesHint')}
      >
        {(props) => (
          <select
            {...props}
            name="entryTimes"
            value={entryTimes}
            className={selectClass}
            onChange={(e) => {
              setEntryTimes(entryTimesSchema.parse(e.currentTarget.value));
              changed();
            }}
          >
            {entryTimesSchema.options.map((option) => (
              <option key={option} value={option}>
                {t(`settings.ledger.entryTimesOptions.${option}`)}
              </option>
            ))}
          </select>
        )}
      </FieldControl>
      <FormError message={problem?.message ?? null} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" className="h-11" disabled={save.isPending}>
          {save.isPending ? t('settings.saving') : t('settings.save')}
        </Button>
        <p role="status" className="text-sm text-text-muted">
          {saved ? t('settings.saved') : ''}
        </p>
      </div>
    </form>
  );
}

function PaydayForm({
  settings,
  today,
}: {
  settings: LedgerSettingsView;
  today: TodayView;
}) {
  const [rule, setRule] = useState(settings.paydayRule);
  const [day, setDay] = useState(settings.paydayDay);
  const [override, setOverride] = useState(settings.paydayOverride ?? '');
  const [status, setStatus] = useState('');
  const save = useSaveLedgerSettings();
  const problem = save.isError ? describeProblem(save.error) : null;

  const changed = (): void => {
    setStatus('');
    if (save.isError) save.reset();
  };
  const send = (body: UpdateLedgerSettingsBody, done: string) => {
    save.mutate(body, {
      onSuccess: (next) => {
        setOverride(next.paydayOverride ?? '');
        setStatus(done);
      },
    });
  };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    send(
      {
        paydayRule: rule,
        paydayDay: day,
        paydayOverride: override === '' ? null : override,
      },
      t('settings.saved'),
    );
  }

  return (
    <section
      id="payday"
      aria-labelledby="payday-title"
      className="mt-10 scroll-mt-6"
    >
      <h3
        id="payday-title"
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        {t('settings.payday.title')}
      </h3>
      <p className="mt-1 max-w-prose text-sm text-text-muted">
        {t('settings.payday.next', {
          date: formatLongDay(today.cycle.payday, settings.locale),
          count: today.daysLeft,
        })}
      </p>
      <form className="mt-4 grid max-w-md gap-5" onSubmit={submit} noValidate>
        <PaydayRuleFields
          rule={rule}
          day={day}
          onRule={(next) => {
            setRule(next);
            changed();
          }}
          onDay={(next) => {
            setDay(next);
            changed();
          }}
        />
        <FieldControl
          label={t('settings.payday.override')}
          hint={t('settings.payday.overrideHint')}
          error={problem?.fields.paydayOverride}
        >
          {(props) => (
            <Input
              {...props}
              type="date"
              name="paydayOverride"
              value={override}
              className="h-11 text-base"
              onChange={(e) => {
                setOverride(e.currentTarget.value);
                changed();
              }}
            />
          )}
        </FieldControl>
        <FormError message={problem?.message ?? null} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" className="h-11" disabled={save.isPending}>
            {save.isPending ? t('settings.saving') : t('settings.save')}
          </Button>
          {settings.paydayOverride === null ? null : (
            <Button
              type="button"
              variant="outlined"
              className="h-11"
              disabled={save.isPending}
              onClick={() => {
                send(
                  { paydayOverride: null },
                  t('settings.payday.overrideCleared'),
                );
              }}
            >
              {t('settings.payday.clearOverride')}
            </Button>
          )}
          <p role="status" className="text-sm text-text-muted">
            {status}
          </p>
        </div>
      </form>
    </section>
  );
}

// Locale, time zone and default currency change how figures come out, never
// the entries; the payday rule sets the cycle (FR-C2, FR-X2).
export function LedgerSettingsSection({
  settings,
  today,
}: {
  settings: LedgerSettingsView;
  today: TodayView;
}) {
  return (
    <Section id="ledger" title={t('settings.ledger.title')}>
      <LedgerForm settings={settings} />
      <PaydayForm settings={settings} today={today} />
    </Section>
  );
}
