import {
  formatMoney,
  type AccountView,
  type BudgetStatusView,
  type CategoryView,
  type CurrencyCode,
  type PaydayPlanView,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/features/accounts/sheet';
import { MoneyInput } from '@/features/budget/money-input';
import { Section } from '@/features/settings/section';
import { useBusy } from '@/features/settings/use-busy';
import { budgetQueryKeys } from '@/lib/budgets';
import { confirmPaydayPlan, paydayPlanQuery } from '@/lib/plan';
import { describeProblem } from '@/lib/problem';
import { invalidate } from '@/lib/settings';
import { t } from '@/messages/t';
import { initialTexts, lineKey, toConfirmBody } from './lines.ts';

function PlanForm({
  plan,
  budgets,
  categories,
  accounts,
  currency,
  locale,
  onDone,
  onBusyChange,
}: {
  plan: PaydayPlanView;
  budgets: BudgetStatusView;
  categories: readonly CategoryView[];
  accounts: readonly AccountView[];
  currency: CurrencyCode;
  locale: string;
  onDone: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const open = accounts.filter((a) => !a.archived);
  const spending = open.filter((a) => a.budgetGroup === 'on');
  const saving = open.filter((a) => a.budgetGroup === 'off');
  const [texts, setTexts] = useState(() => initialTexts(plan.lines, locale));
  const [from, setFrom] = useState(spending[0]?.id ?? '');
  const [to, setTo] = useState(saving[0]?.id ?? '');
  const [invalid, setInvalid] = useState<string[]>([]);
  const confirm = useMutation({
    mutationFn: confirmPaydayPlan,
    onSuccess: async () => {
      await invalidate(queryClient, [...budgetQueryKeys, ['accounts']]);
      onDone();
    },
  });
  useBusy(confirm.isPending, onBusyChange);
  const hasSavings = plan.savings.amountMinor > 0;
  const moves = hasSavings && from !== '' && to !== '';

  const nameOf = (line: PaydayPlanView['lines'][number]) =>
    line.budgetId !== null
      ? (budgets.budgets.find((b) => b.id === line.budgetId)?.name ?? '')
      : (categories.find((c) => c.id === line.categoryId)?.name ?? '');

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = toConfirmBody(
      plan.lines,
      texts,
      currency,
      locale,
      moves ? { fromAccountId: from, toAccountId: to } : undefined,
    );
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    setInvalid([]);
    confirm.mutate(result.body);
  }

  if (plan.income.amountMinor <= 0)
    return <p className="mt-4 text-body">{t('budget.payday.noIncome')}</p>;

  return (
    <form className="mt-4 grid gap-4" noValidate onSubmit={submit}>
      <p className="text-body">
        {t('budget.payday.income', {
          amount: formatMoney(plan.income, locale),
        })}
      </p>
      <fieldset className="grid gap-3 rounded-md border border-outline-variant p-3">
        <legend className="px-1 text-title">
          {t('budget.payday.savings')}
        </legend>
        {hasSavings ? (
          <>
            <p className="text-body" data-testid="payday-savings">
              {t('budget.payday.savingsLine', {
                amount: formatMoney(plan.savings, locale),
              })}
            </p>
            {saving.length === 0 ? (
              <p className="text-body text-text-muted">
                {t('budget.payday.noSavingsAccount')}
              </p>
            ) : (
              <>
                <FieldControl label={t('budget.payday.from')}>
                  {(props) => (
                    <select
                      {...props}
                      value={from}
                      className={selectClass}
                      onChange={(e) => {
                        setFrom(e.currentTarget.value);
                      }}
                    >
                      {spending.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FieldControl>
                <FieldControl label={t('budget.payday.to')}>
                  {(props) => (
                    <select
                      {...props}
                      value={to}
                      className={selectClass}
                      onChange={(e) => {
                        setTo(e.currentTarget.value);
                      }}
                    >
                      {saving.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FieldControl>
              </>
            )}
          </>
        ) : (
          <p className="text-body text-text-muted">
            {t('budget.payday.noSavingsLine')}
          </p>
        )}
      </fieldset>
      <p className="text-body">
        {t('budget.payday.toPlan', {
          amount: formatMoney(plan.toPlan, locale),
        })}
      </p>
      {plan.lines.length === 0 ? (
        <p className="text-body text-text-muted">
          {t('budget.payday.noLines')}
        </p>
      ) : (
        <div className="grid gap-3">
          <h3 className="text-title">{t('budget.payday.budgets')}</h3>
          {plan.lines.map((line) => {
            const key = lineKey(line);
            return (
              <MoneyInput
                key={key}
                label={nameOf(line)}
                name={`plan-${key}`}
                value={texts[key] ?? ''}
                currency={currency}
                locale={locale}
                error={invalid.includes(key) ? 'invalid' : undefined}
                hint={
                  line.suggested.amountMinor > 0
                    ? line.current.amountMinor > 0
                      ? t('budget.payday.planned', {
                          amount: formatMoney(line.current, locale),
                        })
                      : t('budget.payday.suggested', {
                          amount: formatMoney(line.suggested, locale),
                        })
                    : undefined
                }
                onChange={(value) => {
                  setTexts((current) => ({ ...current, [key]: value }));
                }}
              />
            );
          })}
        </div>
      )}
      <FormError
        message={
          confirm.isError ? describeProblem(confirm.error).message : null
        }
      />
      <Button type="submit" disabled={confirm.isPending}>
        {confirm.isPending ? t('settings.saving') : t('budget.payday.confirm')}
      </Button>
    </form>
  );
}

/** The payday sheet: savings first, then the budgets, one tap to confirm. */
export function PaydaySection({
  budgets,
  categories,
  accounts,
  currency,
  locale,
}: {
  budgets: BudgetStatusView;
  categories: readonly CategoryView[];
  accounts: readonly AccountView[];
  currency: CurrencyCode;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = useQuery({ ...paydayPlanQuery, enabled: open });
  return (
    <Section
      id="payday"
      title={t('budget.payday.title')}
      intro={t('budget.payday.intro')}
    >
      <Button
        className="mt-3"
        variant="tonal"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('budget.payday.open')}
      </Button>
      <Sheet
        open={open}
        title={t('budget.payday.sheetTitle')}
        busy={busy}
        onClose={() => {
          setOpen(false);
        }}
      >
        {plan.data === undefined ? (
          <p role="status" className="mt-4 text-text-muted">
            {plan.isError
              ? describeProblem(plan.error).message
              : t('budget.payday.loading')}
          </p>
        ) : (
          <PlanForm
            plan={plan.data}
            budgets={budgets}
            categories={categories}
            accounts={accounts}
            currency={currency}
            locale={locale}
            onBusyChange={setBusy}
            onDone={() => {
              setOpen(false);
            }}
          />
        )}
      </Sheet>
    </Section>
  );
}
