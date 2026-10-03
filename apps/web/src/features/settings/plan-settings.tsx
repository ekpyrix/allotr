import {
  formatMoneyInput,
  type LedgerSettingsView,
  type UpdateLedgerSettingsBody,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { budgetQueryKeys } from '@/lib/budgets';
import { describeProblem } from '@/lib/problem';
import { invalidate, updateLedgerSettings } from '@/lib/settings';
import { t } from '@/messages/t';
import {
  payKind,
  percentText,
  toPayYourselfFirst,
  type PayKind,
} from './plan-draft.ts';
import { Section } from './section.tsx';

function initialPayText(
  setting: LedgerSettingsView['payYourselfFirst'],
  locale: string,
) {
  if (setting === null) return '';
  return setting.kind === 'percent'
    ? percentText(setting.basisPoints)
    : formatMoneyInput(setting.amount, locale);
}

function PlanForm({ settings }: { settings: LedgerSettingsView }) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(settings.budgetPeriod);
  const [mode, setMode] = useState(settings.dailyMode);
  const [countSavings, setCountSavings] = useState(
    settings.countSavingsInDaily,
  );
  const [kind, setKind] = useState<PayKind>(payKind(settings.payYourselfFirst));
  const [payText, setPayText] = useState(
    initialPayText(settings.payYourselfFirst, settings.locale),
  );
  const [months, setMonths] = useState(String(settings.emergencyMonths));
  const [writeOff, setWriteOff] = useState(
    String(settings.iouWriteOffAfterDays),
  );
  const [invalid, setInvalid] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: (body: UpdateLedgerSettingsBody) => updateLedgerSettings(body),
    onSuccess: async () => {
      await invalidate(queryClient, [...budgetQueryKeys, ['accounts']]);
      setSaved(true);
    },
  });
  const changed = () => {
    setSaved(false);
    if (save.isError) save.reset();
  };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const pay = toPayYourselfFirst(
      kind,
      payText,
      settings.defaultCurrency,
      settings.locale,
    );
    const emergency = Number(months);
    if (pay === 'invalid') {
      setInvalid('pay');
      return;
    }
    if (!Number.isInteger(emergency) || emergency < 1 || emergency > 24) {
      setInvalid('months');
      return;
    }
    const days = Number(writeOff);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setInvalid('writeOff');
      return;
    }
    setInvalid(null);
    save.mutate({
      iouWriteOffAfterDays: days,
      budgetPeriod: period,
      dailyMode: mode,
      countSavingsInDaily: countSavings,
      payYourselfFirst: pay,
      emergencyMonths: emergency,
    });
  }

  return (
    <form className="mt-4 grid max-w-md gap-5" noValidate onSubmit={submit}>
      <FieldControl
        label={t('settings.plan.period')}
        hint={t('settings.plan.periodHint')}
      >
        {(props) => (
          <select
            {...props}
            name="budgetPeriod"
            value={period}
            className={selectClass}
            onChange={(e) => {
              setPeriod(e.currentTarget.value === 'month' ? 'month' : 'cycle');
              changed();
            }}
          >
            <option value="cycle">{t('settings.plan.periods.cycle')}</option>
            <option value="month">{t('settings.plan.periods.month')}</option>
          </select>
        )}
      </FieldControl>
      <FieldControl
        label={t('settings.plan.mode')}
        hint={t(`settings.plan.modeHint.${mode}`)}
      >
        {(props) => (
          <select
            {...props}
            name="dailyMode"
            value={mode}
            className={selectClass}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setMode(
                v === 'pool-minus-bills' || v === 'daily-budgets' ? v : 'free',
              );
              changed();
            }}
          >
            <option value="free">{t('settings.plan.modes.free')}</option>
            <option value="pool-minus-bills">
              {t('settings.plan.modes.pool-minus-bills')}
            </option>
            <option value="daily-budgets">
              {t('settings.plan.modes.daily-budgets')}
            </option>
          </select>
        )}
      </FieldControl>
      <div className="grid gap-1">
        <div className="flex items-center gap-3">
          <Switch
            id="count-savings"
            checked={countSavings}
            onCheckedChange={(next) => {
              setCountSavings(next);
              changed();
            }}
          />
          <label htmlFor="count-savings" className="text-body">
            {t('settings.plan.countSavings')}
          </label>
        </div>
        <p className="text-body text-text-muted">
          {t('settings.plan.countSavingsHint')}
        </p>
      </div>
      <FieldControl
        label={t('settings.plan.payKind')}
        hint={t('settings.plan.payHint')}
      >
        {(props) => (
          <select
            {...props}
            name="payKind"
            value={kind}
            className={selectClass}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setKind(v === 'fixed' || v === 'percent' ? v : 'none');
              changed();
            }}
          >
            <option value="none">{t('settings.plan.payKinds.none')}</option>
            <option value="fixed">{t('settings.plan.payKinds.fixed')}</option>
            <option value="percent">
              {t('settings.plan.payKinds.percent')}
            </option>
          </select>
        )}
      </FieldControl>
      {kind === 'none' ? null : (
        <FieldControl
          label={
            kind === 'percent'
              ? t('settings.plan.payPercent')
              : t('settings.plan.payFixed')
          }
          error={invalid === 'pay' ? t('settings.plan.payInvalid') : undefined}
        >
          {(props) => (
            <Input
              {...props}
              name="payValue"
              inputMode="decimal"
              autoComplete="off"
              value={payText}
              className="h-11 text-base"
              onChange={(e) => {
                setPayText(e.currentTarget.value);
                changed();
              }}
            />
          )}
        </FieldControl>
      )}
      <FieldControl
        label={t('settings.plan.months')}
        hint={t('settings.plan.monthsHint')}
        error={
          invalid === 'months' ? t('settings.plan.monthsInvalid') : undefined
        }
      >
        {(props) => (
          <Input
            {...props}
            name="emergencyMonths"
            inputMode="numeric"
            autoComplete="off"
            value={months}
            className="h-11 text-base"
            onChange={(e) => {
              setMonths(e.currentTarget.value);
              changed();
            }}
          />
        )}
      </FieldControl>
      <FieldControl
        label={t('settings.plan.writeOff')}
        hint={t('settings.plan.writeOffHint')}
        error={
          invalid === 'writeOff'
            ? t('settings.plan.writeOffInvalid')
            : undefined
        }
      >
        {(props) => (
          <Input
            {...props}
            name="iouWriteOffAfterDays"
            inputMode="numeric"
            autoComplete="off"
            value={writeOff}
            className="h-11 text-base"
            onChange={(e) => {
              setWriteOff(e.currentTarget.value);
              changed();
            }}
          />
        )}
      </FieldControl>
      <FormError
        message={save.isError ? describeProblem(save.error).message : null}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? t('settings.saving') : t('settings.plan.save')}
        </Button>
        {saved ? <p role="status">{t('settings.plan.saved')}</p> : null}
      </div>
    </form>
  );
}

/** Budget period, daily-number mode, pay yourself first and the fund target. */
export function PlanSettingsSection({
  settings,
}: {
  settings: LedgerSettingsView;
}) {
  return (
    <Section
      id="plan"
      title={t('settings.plan.title')}
      intro={t('settings.plan.intro')}
    >
      <PlanForm settings={settings} />
    </Section>
  );
}
