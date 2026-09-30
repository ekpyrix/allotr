import { paydayRules, type PaydayRule } from '@allotr/shared';
import { FieldControl, selectClass } from '@/components/field';
import { t } from '@/messages/t';

const days = Array.from({ length: 31 }, (_, i) => i + 1);

/** The rule and, where it uses one, the day of the month (FR-C2). */
export function PaydayRuleFields({
  rule,
  day,
  error,
  onRule,
  onDay,
}: {
  rule: PaydayRule;
  day: number;
  error?: string | undefined;
  onRule: (rule: PaydayRule) => void;
  onDay: (day: number) => void;
}) {
  return (
    <>
      <FieldControl
        label={t('settings.payday.rule')}
        hint={t(`settings.payday.ruleHint.${rule}`)}
      >
        {(props) => (
          <select
            {...props}
            name="paydayRule"
            value={rule}
            className={selectClass}
            onChange={(e) => {
              const next = paydayRules.find((r) => r === e.currentTarget.value);
              if (next !== undefined) onRule(next);
            }}
          >
            {paydayRules.map((r) => (
              <option key={r} value={r}>
                {t(`settings.payday.rules.${r}`)}
              </option>
            ))}
          </select>
        )}
      </FieldControl>
      {rule === 'last-working-day' ? null : (
        <FieldControl
          label={
            rule === 'manual'
              ? t('settings.payday.dayManual')
              : t('settings.payday.day')
          }
          hint={t('settings.payday.dayHint')}
          error={error}
        >
          {(props) => (
            <select
              {...props}
              name="paydayDay"
              value={day}
              className={selectClass}
              onChange={(e) => {
                onDay(Number(e.currentTarget.value));
              }}
            >
              {days.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </FieldControl>
      )}
    </>
  );
}
