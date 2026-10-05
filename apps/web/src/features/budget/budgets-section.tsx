import {
  formatMoney,
  formatMoneyInput,
  money,
  type BudgetStatusView,
  type BudgetView,
  type CategoryView,
  type CurrencyCode,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LinearProgress } from '@/components/ui/progress';
import { StatusChip } from '@/components/ui/status-chip';
import { Sheet } from '@/features/accounts/sheet';
import { categoryOptions } from '@/features/quick-entry/options';
import {
  parseBillAmount,
  type AmountError,
} from '@/features/settings/bill-draft';
import { Section } from '@/features/settings/section';
import { useBusy } from '@/features/settings/use-busy';
import {
  budgetQueryKeys,
  createBudget,
  deleteBudget,
  endBudget,
  updateBudget,
} from '@/lib/budgets';
import { describeProblem } from '@/lib/problem';
import { invalidate } from '@/lib/settings';
import { t } from '@/messages/t';
import { budgetName, canDelete, countedCategory } from './budget-draft.ts';
import { MoneyInput } from './money-input.tsx';
import { spentShare } from './share.ts';

type Mode = BudgetView['mode'];
type Leftover = BudgetView['leftover'];
type Open = { kind: 'create' } | { kind: 'edit'; budget: BudgetView } | null;

function useBudgetChange<A, R>(run: (args: A) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await invalidate(queryClient, budgetQueryKeys);
    },
  });
}

function ModeSelect({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <FieldControl
      label={t('budget.budgets.mode')}
      hint={t(`budget.budgets.modeHint.${value}`)}
    >
      {(props) => (
        <select
          {...props}
          name="mode"
          value={value}
          className={selectClass}
          onChange={(e) => {
            onChange(
              e.currentTarget.value === 'set-aside' ? 'set-aside' : 'daily',
            );
          }}
        >
          <option value="daily">{t('budget.budgets.modes.daily')}</option>
          <option value="set-aside">
            {t('budget.budgets.modes.set-aside')}
          </option>
        </select>
      )}
    </FieldControl>
  );
}

function LeftoverSelect({
  value,
  onChange,
}: {
  value: Leftover;
  onChange: (leftover: Leftover) => void;
}) {
  return (
    <FieldControl label={t('budget.budgets.leftover')}>
      {(props) => (
        <select
          {...props}
          name="leftover"
          value={value}
          className={selectClass}
          onChange={(e) => {
            onChange(e.currentTarget.value === 'carry' ? 'carry' : 'free');
          }}
        >
          <option value="free">{t('budget.budgets.leftovers.free')}</option>
          <option value="carry">{t('budget.budgets.leftovers.carry')}</option>
        </select>
      )}
    </FieldControl>
  );
}

function BudgetForm({
  budget,
  categories,
  taken,
  periodFrom,
  currency,
  locale,
  onDone,
  onBusyChange,
}: {
  budget: BudgetView | undefined;
  categories: readonly CategoryView[];
  /** Categories that already have a budget in use. */
  taken: ReadonlySet<string>;
  /** First day of the current period. */
  periodFrom: string;
  currency: CurrencyCode;
  locale: string;
  onDone: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const options = categoryOptions(categories, 'expense').filter(
    (o) => !taken.has(o.id),
  );
  const isBuffer = budget?.target.kind === 'buffer';
  const [name, setName] = useState(budget?.name ?? '');
  // Never preselected: a budget counts what the user chose, nothing else.
  const [categoryId, setCategoryId] = useState('');
  const [categoryError, setCategoryError] = useState(false);
  const [amount, setAmount] = useState(
    budget === undefined ? '' : formatMoneyInput(budget.amount, locale),
  );
  const [mode, setMode] = useState<Mode>(budget?.mode ?? 'daily');
  const [picked, setLeftover] = useState<Leftover | undefined>(
    budget?.leftover,
  );
  // Until chosen, the leftover follows the mode, as the server's default does.
  const leftover: Leftover =
    picked ?? (mode === 'set-aside' ? 'carry' : 'free');
  const [amountError, setAmountError] = useState<AmountError>();
  const create = useBudgetChange(createBudget);
  const update = useBudgetChange(
    (args: { id: string; body: Parameters<typeof updateBudget>[1] }) =>
      updateBudget(args.id, args.body),
  );
  const end = useBudgetChange(endBudget);
  const remove = useBudgetChange(deleteBudget);
  const pending =
    create.isPending || update.isPending || end.isPending || remove.isPending;
  useBusy(pending, onBusyChange);
  const failure = create.error ?? update.error ?? end.error ?? remove.error;
  const problem = failure === null ? null : describeProblem(failure);
  const nameId = useId();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseBillAmount(amount, currency, locale);
    // The Buffer may be planned at zero; a budget needs an amount.
    const zeroBuffer = isBuffer && amount.trim() === '0';
    if (!parsed.ok && !zeroBuffer) {
      setAmountError(parsed.error);
      return;
    }
    setAmountError(undefined);
    const planned = parsed.ok ? parsed.amount : money(0, currency);
    if (budget === undefined) {
      if (categoryId === '') {
        setCategoryError(true);
        return;
      }
      create.mutate(
        {
          name: budgetName(name, categoryId, categories),
          target: { kind: 'category', categoryId },
          amount: planned,
          mode,
          ...(picked === undefined ? {} : { leftover: picked }),
        },
        { onSuccess: onDone },
      );
    } else {
      update.mutate(
        {
          id: budget.id,
          body: isBuffer
            ? { name: name.trim(), amount: planned }
            : { name: name.trim(), amount: planned, mode, leftover },
        },
        { onSuccess: onDone },
      );
    }
  }

  return (
    <form className="mt-4 grid gap-4" noValidate onSubmit={submit}>
      {budget === undefined ? (
        <FieldControl
          label={t('budget.budgets.category')}
          error={
            categoryError ? t('budget.budgets.categoryRequired') : undefined
          }
        >
          {(props) => (
            <select
              {...props}
              name="categoryId"
              value={categoryId}
              className={selectClass}
              onChange={(e) => {
                setCategoryId(e.currentTarget.value);
                setCategoryError(false);
              }}
            >
              <option value="">{t('budget.budgets.chooseCategory')}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </FieldControl>
      ) : null}
      <div className="grid gap-2">
        <label htmlFor={nameId} className="text-sm font-medium">
          {t('budget.budgets.name')}
        </label>
        <Input
          id={nameId}
          name="name"
          value={name}
          maxLength={100}
          autoComplete="off"
          placeholder={
            budget === undefined
              ? budgetName('', categoryId, categories)
              : undefined
          }
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
        />
      </div>
      <MoneyInput
        label={t('budget.budgets.amount')}
        name="amount"
        value={amount}
        currency={currency}
        locale={locale}
        error={amountError}
        hint={t('budget.budgets.amountHint')}
        onChange={setAmount}
      />
      {isBuffer ? (
        <p className="text-body text-text-muted">
          {t('budget.budgets.bufferFixed')}
        </p>
      ) : (
        <>
          <ModeSelect value={mode} onChange={setMode} />
          <LeftoverSelect value={leftover} onChange={setLeftover} />
        </>
      )}
      <FormError message={problem?.message ?? null} />
      <div className="flex flex-wrap justify-between gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t('settings.saving') : t('budget.budgets.save')}
        </Button>
        {budget !== undefined && !isBuffer ? (
          <div className="flex flex-wrap gap-3">
            {canDelete(budget, periodFrom) ? (
              <Button
                type="button"
                variant="danger-tonal"
                disabled={pending}
                onClick={() => {
                  remove.mutate(budget.id, { onSuccess: onDone });
                }}
              >
                {t('budget.budgets.delete')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="danger-tonal"
              disabled={pending}
              onClick={() => {
                end.mutate(budget.id, { onSuccess: onDone });
              }}
            >
              {t('budget.budgets.end')}
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
}

function BudgetRow({
  budget,
  categories,
  locale,
  onOpen,
}: {
  budget: BudgetView;
  categories: readonly CategoryView[];
  locale: string;
  onOpen: () => void;
}) {
  const share = spentShare(budget.spent, budget.left);
  const over = budget.overflow.amountMinor > 0;
  const counted = countedCategory(budget.target, categories);
  return (
    <li className="border-b border-outline-variant py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-body font-medium wrap-anywhere">{budget.name}</h4>
          {counted === undefined ? null : (
            <p className="text-caption text-text-muted">
              {t('budget.budgets.counts', { category: counted })}
            </p>
          )}
          <p className="text-caption text-text-muted">
            {t('budget.budgets.spentOfPlanned', {
              spent: formatMoney(budget.spent, locale),
              planned: formatMoney(budget.planned, locale),
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-body" data-testid="budget-left">
            {t('budget.budgets.left', {
              amount: formatMoney(budget.left, locale),
            })}
          </p>
          <Button
            variant="link"
            size="dense"
            onClick={onOpen}
            aria-label={t('budget.budgets.edit', { name: budget.name })}
          >
            {t('budget.edit')}
          </Button>
        </div>
      </div>
      <LinearProgress
        className="mt-2"
        value={share}
        label={t('budget.budgets.progress', { name: budget.name })}
      />
      {over ? (
        <p className="mt-1 text-caption text-text-muted">
          {t('budget.budgets.overflow', {
            amount: formatMoney(budget.overflow, locale),
          })}
        </p>
      ) : null}
      {budget.mode === 'set-aside' && budget.held.amountMinor > 0 ? (
        <p className="mt-1 text-caption text-text-muted">
          {t('budget.budgets.held', {
            amount: formatMoney(budget.held, locale),
          })}
        </p>
      ) : null}
    </li>
  );
}

function Group({
  title,
  intro,
  budgets,
  categories,
  locale,
  onOpen,
}: {
  title: string;
  intro: string;
  budgets: readonly BudgetView[];
  categories: readonly CategoryView[];
  locale: string;
  onOpen: (budget: BudgetView) => void;
}) {
  const id = useId();
  if (budgets.length === 0) return null;
  return (
    <div role="group" aria-labelledby={id} className="mt-6">
      <h3 id={id} className="flex items-center gap-2 text-title">
        {title}
      </h3>
      <p className="text-caption text-text-muted">{intro}</p>
      <ul className="mt-2 border-y border-outline-variant">
        {budgets.map((b) => (
          <BudgetRow
            key={b.id}
            budget={b}
            categories={categories}
            locale={locale}
            onOpen={() => {
              onOpen(b);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

/** Budgets for the period: what each has left, split by daily or set aside. */
export function BudgetsSection({
  status,
  categories,
  currency,
  locale,
}: {
  status: BudgetStatusView;
  categories: readonly CategoryView[];
  currency: CurrencyCode;
  locale: string;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const taken = new Set(
    status.budgets.flatMap((b) =>
      b.target.kind === 'category' ? [b.target.categoryId] : [],
    ),
  );
  const daily = status.budgets.filter((b) => b.mode === 'daily');
  const setAside = status.budgets.filter((b) => b.mode === 'set-aside');
  return (
    <Section
      id="budgets"
      title={t('budget.budgets.title')}
      intro={t('budget.budgets.intro')}
    >
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <StatusChip tone="info" icon={<Wallet aria-hidden="true" />}>
          {t('budget.budgets.free', {
            amount: formatMoney(status.free, locale),
          })}
        </StatusChip>
        <Button
          variant="tonal"
          size="dense"
          onClick={() => {
            setOpen({ kind: 'create' });
          }}
        >
          <Plus aria-hidden="true" />
          {t('budget.budgets.add')}
        </Button>
      </div>
      <Group
        title={t('budget.budgets.dailyTitle')}
        intro={t('budget.budgets.dailyIntro')}
        budgets={daily}
        categories={categories}
        locale={locale}
        onOpen={(budget) => {
          setOpen({ kind: 'edit', budget });
        }}
      />
      <Group
        title={t('budget.budgets.setAsideTitle')}
        intro={t('budget.budgets.setAsideIntro')}
        budgets={setAside}
        categories={categories}
        locale={locale}
        onOpen={(budget) => {
          setOpen({ kind: 'edit', budget });
        }}
      />
      {daily.length === 0 ? (
        <p className="mt-4 max-w-prose text-body text-text-muted">
          {t('budget.budgets.noDaily')}
        </p>
      ) : null}
      <Sheet
        open={open !== null}
        title={
          open?.kind === 'edit'
            ? t('budget.budgets.editTitle', { name: open.budget.name })
            : t('budget.budgets.addTitle')
        }
        busy={busy}
        onClose={() => {
          setOpen(null);
        }}
      >
        {open === null ? null : (
          <BudgetForm
            key={open.kind === 'edit' ? open.budget.id : 'new'}
            budget={open.kind === 'edit' ? open.budget : undefined}
            categories={categories}
            taken={taken}
            periodFrom={status.period.from}
            currency={currency}
            locale={locale}
            onBusyChange={setBusy}
            onDone={() => {
              setOpen(null);
            }}
          />
        )}
      </Sheet>
    </Section>
  );
}
