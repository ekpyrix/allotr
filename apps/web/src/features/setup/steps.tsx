import {
  formatMoney,
  type AccountView,
  type BillView,
  type LedgerSettingsView,
  type UpdateLedgerSettingsBody,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreateAccountForm } from '@/features/accounts/create-account-form';
import { BillForm } from '@/features/settings/bills';
import { PaydayRuleFields } from '@/features/settings/payday-rule';
import {
  browserRegion,
  localeSample,
  timeZoneOptions,
} from '@/features/settings/region';
import { useCurrencyOptions } from '@/lib/currency-options';
import { describeProblem } from '@/lib/problem';
import {
  figureQueryKeys,
  invalidate,
  updateLedgerSettings,
} from '@/lib/settings';
import { t } from '@/messages/t';

// The steps of setup (FR-W7). Each saves through the same endpoints as
// Settings and Accounts, then calls `onNext`; `onSkip` moves on without
// saving.

interface StepProps {
  busy: boolean;
  onNext: () => void;
  onSkip: () => void;
}

function Actions({
  busy,
  primary,
  onSkip,
}: {
  busy: boolean;
  /** A submit button for the step's form, or a plain button. */
  primary: { label: string; onClick?: () => void };
  onSkip?: (() => void) | undefined;
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Button
        type={primary.onClick === undefined ? 'submit' : 'button'}

        className="h-11"
        disabled={busy}
        onClick={primary.onClick}
      >
        {busy ? t('setup.saving') : primary.label}
      </Button>
      {onSkip === undefined ? null : (
        <Button
          type="button"
          variant="outlined"

          className="h-11"
          disabled={busy}
          onClick={onSkip}
        >
          {t('setup.skip')}
        </Button>
      )}
    </div>
  );
}

function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateLedgerSettings,
    onSuccess: async () => {
      await invalidate(queryClient, figureQueryKeys);
    },
  });
}

/** Only the fields that differ from what is saved. */
function changes(
  settings: LedgerSettingsView,
  next: Required<
    Pick<UpdateLedgerSettingsBody, 'locale' | 'timeZone' | 'defaultCurrency'>
  >,
): UpdateLedgerSettingsBody {
  return {
    ...(next.locale === settings.locale ? {} : { locale: next.locale }),
    ...(next.timeZone === settings.timeZone ? {} : { timeZone: next.timeZone }),
    ...(next.defaultCurrency === settings.defaultCurrency
      ? {}
      : { defaultCurrency: next.defaultCurrency }),
  };
}

export function RegionStep({
  settings,
  busy,
  onNext,
  onSkip,
  detect,
}: StepProps & { settings: LedgerSettingsView; detect: boolean }) {
  // New users start at UTC and en-US; this device knows better. Coming
  // back to the step, the saved choice wins.
  const [detected] = useState<ReturnType<typeof browserRegion>>(() =>
    detect ? browserRegion() : {},
  );
  const [locale, setLocale] = useState(detected.locale ?? settings.locale);
  const [timeZone, setTimeZone] = useState(
    detected.timeZone ?? settings.timeZone,
  );
  const [currency, setCurrency] = useState<string>(settings.defaultCurrency);
  const zones = useMemo(() => timeZoneOptions(timeZone), [timeZone]);
  const currencies = useCurrencyOptions(settings.locale);
  const save = useSaveSettings();
  const problem = save.isError ? describeProblem(save.error) : null;
  const example = localeSample(locale.trim(), currency);
  const reset = () => {
    if (save.isError) save.reset();
  };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = changes(settings, {
      locale: locale.trim(),
      timeZone,
      defaultCurrency: currency,
    });
    if (Object.keys(body).length === 0) {
      onNext();
      return;
    }
    save.mutate(body, { onSuccess: onNext });
  }

  return (
    <form className="mt-6 grid max-w-md gap-5" onSubmit={submit} noValidate>
      <FieldControl
        label={t('settings.ledger.currency')}
        hint={t('settings.ledger.currencyHint')}
        error={problem?.fields.defaultCurrency}
      >
        {(props) => (
          <select
            {...props}
            name="defaultCurrency"
            value={currency}
            className={selectClass}
            onChange={(e) => {
              setCurrency(e.currentTarget.value);
              reset();
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
              reset();
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
            className="h-11 text-base"
            onChange={(e) => {
              setLocale(e.currentTarget.value);
              reset();
            }}
          />
        )}
      </FieldControl>
      <FormError message={problem?.message ?? null} />
      <Actions
        busy={busy || save.isPending}
        primary={{ label: t('setup.continue') }}
        onSkip={onSkip}
      />
    </form>
  );
}

export function PaydayStep({
  settings,
  busy,
  onNext,
  onSkip,
}: StepProps & { settings: LedgerSettingsView }) {
  const [rule, setRule] = useState(settings.paydayRule);
  const [day, setDay] = useState(settings.paydayDay);
  const save = useSaveSettings();
  const problem = save.isError ? describeProblem(save.error) : null;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: UpdateLedgerSettingsBody = {
      ...(rule === settings.paydayRule ? {} : { paydayRule: rule }),
      ...(day === settings.paydayDay ? {} : { paydayDay: day }),
    };
    if (Object.keys(body).length === 0) {
      onNext();
      return;
    }
    save.mutate(body, { onSuccess: onNext });
  }

  return (
    <form className="mt-6 grid max-w-md gap-5" onSubmit={submit} noValidate>
      <PaydayRuleFields
        rule={rule}
        day={day}
        error={problem?.fields.paydayDay}
        onRule={(next) => {
          setRule(next);
          if (save.isError) save.reset();
        }}
        onDay={(next) => {
          setDay(next);
          if (save.isError) save.reset();
        }}
      />
      <FormError message={problem?.message ?? null} />
      <Actions
        busy={busy || save.isPending}
        primary={{ label: t('setup.continue') }}
        onSkip={onSkip}
      />
    </form>
  );
}

function AddedList({ items }: { items: readonly [string, ReactNode][] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={t('setup.added')} className="mt-6">
      <h3 className="text-sm font-medium text-text-muted">
        {t('setup.added')}
      </h3>
      <ul className="mt-2 grid gap-2">
        {items.map(([key, content]) => (
          <li
            key={key}
            className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-md border border-outline-variant p-3"
          >
            {content}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Next without saving anything when nothing was added, so an empty step
 * reads as skipped.
 */
function Next({
  busy,
  added,
  last,
  onNext,
  onSkip,
}: StepProps & { added: boolean; last?: boolean }) {
  return (
    <Actions
      busy={busy}
      primary={
        added || last === true
          ? {
              label: last === true ? t('setup.finish') : t('setup.continue'),
              onClick: onNext,
            }
          : { label: t('setup.skip'), onClick: onSkip }
      }
    />
  );
}

export function AccountsStep({
  group,
  accounts,
  settings,
  today,
  busy,
  onNext,
  onSkip,
  onAnnounce,
}: StepProps & {
  group: AccountView['budgetGroup'];
  accounts: readonly AccountView[];
  settings: LedgerSettingsView;
  today: string;
  onAnnounce: (message: string) => void;
}) {
  const [formKey, setFormKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const mine = accounts.filter((a) => a.budgetGroup === group && !a.archived);

  return (
    <>
      <AddedList
        items={mine.map((a) => [
          a.id,
          <>
            <span className="font-medium">{a.name}</span>
            <span className="font-mono tabular-nums">
              {formatMoney(a.balance, settings.locale)}
            </span>
          </>,
        ])}
      />
      <div className="max-w-md">
        <CreateAccountForm
          key={formKey}
          group={group}
          autoFocus={false}
          defaultCurrency={settings.defaultCurrency}
          today={today}
          locale={settings.locale}
          onBusyChange={setCreating}
          onCreated={(account) => {
            onAnnounce(t('setup.announceAdded', { name: account.name }));
            setFormKey((k) => k + 1);
          }}
        />
      </div>
      <Next
        busy={busy || creating}
        added={mine.length > 0}
        onNext={onNext}
        onSkip={onSkip}
      />
    </>
  );
}

export function BillsStep({
  bills,
  accounts,
  locale,
  busy,
  onNext,
  onSkip,
  onAnnounce,
}: StepProps & {
  bills: readonly BillView[];
  accounts: readonly AccountView[];
  locale: string;
  onAnnounce: (message: string) => void;
}) {
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const hasAccounts = accounts.some((a) => !a.archived);

  return (
    <>
      <AddedList
        items={bills.map((bill) => [
          bill.id,
          <>
            <span className="font-medium">{bill.name}</span>
            <span className="font-mono tabular-nums">
              {formatMoney(bill.amount, locale)}
            </span>
          </>,
        ])}
      />
      {hasAccounts ? (
        <div className="max-w-md">
          <BillForm
            key={formKey}
            bill={undefined}
            accounts={accounts}
            locale={locale}
            onBusyChange={setSaving}
            onDone={(name) => {
              onAnnounce(t('setup.announceAdded', { name }));
              setFormKey((k) => k + 1);
            }}
          />
        </div>
      ) : (
        <p className="mt-6 max-w-prose text-text-muted">
          {t('setup.bills.noAccounts')}
        </p>
      )}
      <Next
        busy={busy || saving}
        added={bills.length > 0}
        last
        onNext={onNext}
        onSkip={onSkip}
      />
    </>
  );
}
