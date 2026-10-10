import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type {
  AccountView,
  BudgetStatusView,
  CategoryView,
  PaydayPlanView,
} from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { initialTexts, lineKey, toConfirmBody } from '@/features/payday/lines';
import { budgetQueryKeys, budgetsQuery } from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { accountsQuery, categoriesQuery } from '@/lib/ledger';
import { paydayPlanQuery, confirmPaydayPlan } from '@/lib/plan';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import {
  ChoiceField,
  TextField,
} from '@/screens/transactions/detail/fields.tsx';

const locale = 'en';

/**
 * The payday sheet (ADR 0021): the savings line first, then one amount per
 * budget, confirmed in one request. The server suggests every figure and
 * does the posting; nothing is summed here.
 */
export function PaydaySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const plan = useQuery({ ...paydayPlanQuery, enabled: open });
  const budgets = useQuery({ ...budgetsQuery, enabled: open });
  const categories = useQuery({ ...categoriesQuery, enabled: open });
  const accounts = useQuery({ ...accountsQuery, enabled: open });
  const ready =
    plan.data !== undefined &&
    budgets.data !== undefined &&
    categories.data !== undefined &&
    accounts.data !== undefined;
  const failed = plan.isError || budgets.isError;
  return (
    <Sheet
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('budgetGoalsIous.payday.title')}
      closeLabel={t('budgetGoalsIous.close')}
    >
      {ready ? (
        <PlanForm
          plan={plan.data}
          budgets={budgets.data}
          categories={categories.data.categories}
          accounts={accounts.data.accounts}
          onClose={onClose}
        />
      ) : (
        <p
          role={failed ? 'alert' : 'status'}
          className="px-3 py-4 text-small text-text-muted"
        >
          {failed
            ? describeProblem(plan.error ?? budgets.error).message
            : t('budgetGoalsIous.payday.loading')}
        </p>
      )}
    </Sheet>
  );
}

function PlanForm({
  plan,
  budgets,
  categories,
  accounts,
  onClose,
}: {
  plan: PaydayPlanView;
  budgets: BudgetStatusView;
  categories: readonly CategoryView[];
  accounts: readonly AccountView[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const currency = plan.income.currency;
  const open = accounts.filter((a) => !a.archived);
  const spending = open.filter((a) => a.budgetGroup === 'on');
  const saving = open.filter((a) => a.budgetGroup === 'off');
  const [texts, setTexts] = useState(() => initialTexts(plan.lines, locale));
  const [from, setFrom] = useState(spending[0]?.id ?? '');
  const [to, setTo] = useState(saving[0]?.id ?? '');
  const [invalid, setInvalid] = useState<string[]>([]);
  const confirm = useMutation({
    mutationFn: confirmPaydayPlan,
    onSuccess: () => {
      for (const queryKey of [...budgetQueryKeys, ['accounts']])
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });
  const hasSavings = plan.savings.amountMinor > 0;
  const moves = hasSavings && from !== '' && to !== '';

  const nameOf = (line: PaydayPlanView['lines'][number]) =>
    line.budgetId !== null
      ? (budgets.budgets.find((b) => b.id === line.budgetId)?.name ?? '')
      : (categories.find((c) => c.id === line.categoryId)?.name ?? '');

  const submit = (event: SyntheticEvent) => {
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
  };

  if (plan.income.amountMinor <= 0)
    return (
      <p className="px-3 py-4 font-sans text-small">
        {t('budgetGoalsIous.payday.noIncome')}
      </p>
    );

  return (
    <form className="flex flex-col gap-3 p-3" noValidate onSubmit={submit}>
      <p className="num text-small">
        {t('budgetGoalsIous.payday.income', {
          amount: formatMoney(plan.income, 'symbol', locale),
        })}
      </p>
      <section
        aria-label={t('budgetGoalsIous.payday.savings')}
        className="flex flex-col gap-2 border border-outline p-2"
      >
        <h3 className="text-small font-semibold">
          {t('budgetGoalsIous.payday.savings')}
        </h3>
        {hasSavings ? (
          <>
            <p className="num text-small">
              {t('budgetGoalsIous.payday.savingsLine', {
                amount: formatMoney(plan.savings, 'symbol', locale),
              })}
            </p>
            {saving.length === 0 ? (
              <p className="font-sans text-small text-text-muted">
                {t('budgetGoalsIous.payday.noSavingsAccount')}
              </p>
            ) : (
              <>
                <ChoiceField
                  label={t('budgetGoalsIous.payday.from')}
                  value={from}
                  choices={spending.map((a) => ({ id: a.id, label: a.name }))}
                  placeholder={t('budgetGoalsIous.payday.from')}
                  onChange={setFrom}
                />
                <ChoiceField
                  label={t('budgetGoalsIous.payday.to')}
                  value={to}
                  choices={saving.map((a) => ({ id: a.id, label: a.name }))}
                  placeholder={t('budgetGoalsIous.payday.to')}
                  onChange={setTo}
                />
              </>
            )}
          </>
        ) : (
          <p className="font-sans text-small text-text-muted">
            {t('budgetGoalsIous.payday.noSavingsLine')}
          </p>
        )}
      </section>
      <p className="num text-small">
        {t('budgetGoalsIous.payday.toPlan', {
          amount: formatMoney(plan.toPlan, 'symbol', locale),
        })}
      </p>
      {plan.lines.length === 0 ? (
        <p className="font-sans text-small text-text-muted">
          {t('budgetGoalsIous.payday.noLines')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="text-small font-semibold">
            {t('budgetGoalsIous.payday.budgets')}
          </h3>
          {plan.lines.map((line) => {
            const key = lineKey(line);
            const hint =
              line.suggested.amountMinor > 0
                ? line.current.amountMinor > 0
                  ? t('budgetGoalsIous.payday.planned', {
                      amount: formatMoney(line.current, 'symbol', locale),
                    })
                  : t('budgetGoalsIous.payday.suggested', {
                      amount: formatMoney(line.suggested, 'symbol', locale),
                    })
                : undefined;
            return (
              <TextField
                key={key}
                label={
                  hint === undefined
                    ? nameOf(line)
                    : `${nameOf(line)} · ${hint}`
                }
                value={texts[key] ?? ''}
                inputMode="decimal"
                error={
                  invalid.includes(key)
                    ? t('budgetGoalsIous.payday.amountError')
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
      {confirm.isError ? (
        <p role="alert" className="text-small text-negative">
          {describeProblem(confirm.error).message}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <BracketButton onPress={onClose}>
          {t('budgetGoalsIous.cancel')}
        </BracketButton>
        <PrimaryButton type="submit" isDisabled={confirm.isPending}>
          {confirm.isPending
            ? t('budgetGoalsIous.saving')
            : t('budgetGoalsIous.payday.confirm')}
        </PrimaryButton>
      </div>
    </form>
  );
}
