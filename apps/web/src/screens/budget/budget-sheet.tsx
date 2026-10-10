import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import {
  MoneyError,
  formatMoneyInput,
  parseMoney,
  type BudgetView,
  type CategoryView,
  type CreateBudgetBody,
} from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { budgetQueryKeys, createBudget, updateBudget } from '@/lib/budgets';
import { t } from '@/messages/t';
import {
  ChoiceField,
  FormRow,
  TextField,
} from '../transactions/detail/fields.tsx';

export type BudgetSheetMode =
  | Readonly<{ kind: 'create'; categories: readonly CategoryView[] }>
  | Readonly<{
      kind: 'sub';
      parent: BudgetView;
      categories: readonly CategoryView[];
    }>
  | Readonly<{ kind: 'edit'; budget: BudgetView }>;

const locale = 'en';

function titleOf(mode: BudgetSheetMode): string {
  if (mode.kind === 'create') return t('budgetBudgets.sheet.newTitle');
  if (mode.kind === 'sub')
    return t('budgetBudgets.sheet.subTitle', { name: mode.parent.name });
  return t('budgetBudgets.sheet.editTitle', { name: mode.budget.name });
}

/**
 * Adds a budget, adds one under another, or edits one. The server owns the
 * rules (one budget per category, the Buffer cannot be edited into a
 * category); this form only collects and parses what was typed.
 */
export function BudgetSheet({
  mode,
  currency,
  onClose,
}: {
  mode: BudgetSheetMode;
  /** The default currency; budgets are planned in it. */
  currency: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = mode.kind === 'edit' ? mode.budget : null;
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState(editing?.name ?? '');
  const [amount, setAmount] = useState(
    editing === null ? '' : formatMoneyInput(editing.amount, locale),
  );
  const [budgetMode, setBudgetMode] = useState<'daily' | 'set-aside'>(
    editing?.mode ?? 'daily',
  );
  const [leftover, setLeftover] = useState<'free' | 'carry'>(
    editing?.leftover ?? 'free',
  );
  const [errors, setErrors] = useState<{ category?: string; amount?: string }>(
    {},
  );
  const choices =
    mode.kind === 'edit'
      ? []
      : mode.categories.map((c) => ({ id: c.id, label: c.name }));

  const save = useMutation({
    mutationFn: (body: CreateBudgetBody) =>
      editing === null
        ? createBudget(body)
        : updateBudget(editing.id, {
            name: body.name,
            amount: body.amount,
            mode: body.mode ?? 'daily',
            leftover: body.leftover ?? 'free',
          }),
    onSuccess: () => {
      for (const queryKey of budgetQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const next: { category?: string; amount?: string } = {};
    if (editing === null && categoryId === '')
      next.category = t('budgetBudgets.sheet.categoryRequired');
    let value: ReturnType<typeof parseMoney> | undefined;
    try {
      value = parseMoney(amount, currency, locale);
      if (value.amountMinor <= 0)
        next.amount = t('quickEntry.errors.amountPositive');
    } catch (caught) {
      if (!(caught instanceof MoneyError)) throw caught;
      next.amount = t('quickEntry.errors.amountInvalid', { example: '120.00' });
    }
    setErrors(next);
    if (next.category !== undefined || next.amount !== undefined) return;
    if (value === undefined) return;
    const chosen =
      mode.kind === 'edit'
        ? undefined
        : choices.find((c) => c.id === categoryId);
    const typed = name.trim();
    save.mutate({
      name: typed === '' ? (editing?.name ?? chosen?.label ?? '') : typed,
      target: { kind: 'category', categoryId },
      amount: value,
      mode: budgetMode,
      leftover,
    });
  };

  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={titleOf(mode)}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        {mode.kind === 'edit' ? null : (
          <ChoiceField
            label={t('budgetBudgets.sheet.category')}
            value={categoryId}
            choices={choices}
            placeholder={t('budgetBudgets.sheet.categoryPick')}
            onChange={setCategoryId}
            error={errors.category}
          />
        )}
        <TextField
          label={t('budgetBudgets.sheet.name')}
          value={name}
          onChange={setName}
          placeholder={t('budgetBudgets.sheet.namePlaceholder')}
        />
        <TextField
          label={t('budgetBudgets.sheet.amount', { currency })}
          value={amount}
          onChange={setAmount}
          error={errors.amount}
          inputMode="decimal"
        />
        <FormRow>
          <ChoiceField
            label={t('budgetBudgets.sheet.mode')}
            value={budgetMode}
            choices={[
              { id: 'daily', label: t('budgetBudgets.sheet.modeDaily') },
              { id: 'set-aside', label: t('budgetBudgets.sheet.modeSetAside') },
            ]}
            placeholder=""
            onChange={(id) => {
              setBudgetMode(id === 'set-aside' ? 'set-aside' : 'daily');
            }}
          />
          <ChoiceField
            label={t('budgetBudgets.sheet.leftover')}
            value={leftover}
            choices={[
              { id: 'free', label: t('budgetBudgets.sheet.leftoverFree') },
              { id: 'carry', label: t('budgetBudgets.sheet.leftoverCarry') },
            ]}
            placeholder=""
            onChange={(id) => {
              setLeftover(id === 'carry' ? 'carry' : 'free');
            }}
          />
        </FormRow>
        {save.isError ? (
          <p role="alert" className="text-small text-negative">
            {t('budgetBudgets.sheet.failed')}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('budgetBudgets.cancel')}
          </BracketButton>
          <PrimaryButton type="submit" isDisabled={save.isPending}>
            {save.isPending
              ? t('budgetBudgets.sheet.saving')
              : editing === null
                ? t('budgetBudgets.sheet.create')
                : t('budgetBudgets.sheet.save')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}
