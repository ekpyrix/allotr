import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type SyntheticEvent } from 'react';
import type {
  AccountView,
  CategoryView,
  TransactionView,
} from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import {
  addLine,
  amountExample,
  draftErrorText,
  endSplit,
  isSplit,
  lineField,
  removeLine,
  splitCurrency,
  splitRemainder,
  startSplit,
  toBody,
  updateLine,
  type DraftErrorKey,
  type DraftField,
  type EntryKind,
  type QuickEntryDraft,
} from '@/features/quick-entry/draft';
import { draftFromEntry } from '@/features/ledger/edit-draft';
import { useSaveEntry } from '@/features/quick-entry/use-save-entry';
import { formatMoney } from '@/lib/format-money';
import { accountsQuery, categoriesQuery } from '@/lib/ledger';
import { randomId } from '@/lib/random-id';
import { t } from '@/messages/t';
import { accountChoicesFor, categoryChoicesFor } from './choices.ts';
import { ChoiceField, FormRow, TextField } from './fields.tsx';

const locale = 'en';

/**
 * Edit, or split, one entry. It is the quick entry draft and request
 * builder on a sheet: an edit posts the old entry's reversal plus the new
 * one, and resolves to the new entry's ID.
 */
export function EditSheet({
  entry,
  split,
  onClose,
  onSaved,
}: {
  entry: TransactionView & { kind: EntryKind };
  /** Opens with the entry already split across categories. */
  split: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const loaded = accounts.data !== undefined && categories.data !== undefined;
  const title = split
    ? t('transactionDetail.edit.splitTitle')
    : t('transactionDetail.edit.title');
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      closeLabel={t('quickEntry.close')}
    >
      {loaded ? (
        <EditForm
          entry={entry}
          split={split}
          accounts={accounts.data.accounts}
          categories={categories.data.categories}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : (
        <p className="px-3 py-4 text-small text-text-muted">
          {t('quickEntry.loading')}
        </p>
      )}
    </Sheet>
  );
}

function EditForm({
  entry,
  split,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  entry: TransactionView & { kind: EntryKind };
  split: boolean;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [draft, setDraft] = useState<QuickEntryDraft>(() => {
    const base = draftFromEntry(entry, locale);
    return split && !isSplit(base) && base.kind !== 'transfer'
      ? startSplit(base)
      : base;
  });
  const [errors, setErrors] = useState<
    Partial<Record<DraftField, DraftErrorKey>>
  >({});
  const save = useSaveEntry(entry.id);
  const context = useMemo(() => ({ accounts, locale }), [accounts]);
  const patch = (next: Partial<QuickEntryDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
  };

  const account = accounts.find((a) => a.id === draft.accountId);
  const toAccount = accounts.find((a) => a.id === draft.toAccountId);
  const example = (currency: string | undefined) =>
    amountExample(currency ?? 'USD', locale);
  const errorText = (field: DraftField, currency?: string) => {
    const key = errors[field];
    return key === undefined
      ? undefined
      : draftErrorText(key, example(currency));
  };
  const crossCurrency =
    draft.kind === 'transfer' &&
    account !== undefined &&
    toAccount !== undefined &&
    account.currency !== toAccount.currency;

  const accountChoices = accountChoicesFor(accounts, [
    draft.accountId,
    draft.toAccountId,
  ]);
  const categoryChoices = categoryChoicesFor(categories, draft.kind);
  const remainder = isSplit(draft) ? splitRemainder(draft, context) : null;
  const lineCurrency = splitCurrency(draft, accounts);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = toBody(draft, context);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(
      { body: result.body, idempotencyKey: randomId() },
      { onSuccess: onSaved },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
      <TextField
        label={t('quickEntry.amountIn', { currency: account?.currency ?? '' })}
        value={draft.amount}
        onChange={(amount) => {
          patch({ amount });
        }}
        error={errorText('amount', account?.currency)}
        inputMode="decimal"
        autoFocus
      />
      <FormRow>
        <ChoiceField
          label={
            draft.kind === 'transfer'
              ? t('quickEntry.fromAccount')
              : t('quickEntry.account')
          }
          value={draft.accountId}
          choices={accountChoices}
          placeholder={t('transactionDetail.edit.chooseAccount')}
          onChange={(accountId) => {
            patch({ accountId });
          }}
          error={errorText('accountId')}
        />
        {draft.kind === 'transfer' ? (
          <ChoiceField
            label={t('quickEntry.toAccount')}
            value={draft.toAccountId}
            choices={accountChoices}
            placeholder={t('transactionDetail.edit.chooseAccount')}
            onChange={(toAccountId) => {
              patch({ toAccountId });
            }}
            error={errorText('toAccountId')}
          />
        ) : null}
      </FormRow>
      {crossCurrency ? (
        <TextField
          label={t('quickEntry.receivedIn', { currency: toAccount.currency })}
          value={draft.received}
          onChange={(received) => {
            patch({ received });
          }}
          error={errorText('received', toAccount.currency)}
          inputMode="decimal"
        />
      ) : null}
      {draft.foreignCurrency === '' ? null : (
        <TextField
          label={t('quickEntry.priceIn', { currency: draft.foreignCurrency })}
          value={draft.foreign}
          onChange={(foreign) => {
            patch({ foreign });
          }}
          error={errorText('foreign', draft.foreignCurrency)}
          inputMode="decimal"
        />
      )}

      {isSplit(draft) ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-small text-text-muted">
            {t('quickEntry.split.legend')}
          </legend>
          {draft.lines.map((line, index) => (
            <FormRow key={index}>
              <ChoiceField
                label={t('quickEntry.split.category', { n: index + 1 })}
                value={line.categoryId}
                choices={categoryChoices}
                placeholder={t('quickEntry.chooseCategory')}
                onChange={(categoryId) => {
                  setDraft((d) => updateLine(d, index, { categoryId }));
                }}
                error={errorText(lineField(index, 'categoryId'))}
              />
              <TextField
                label={t('quickEntry.split.amount', { n: index + 1 })}
                value={line.amount}
                onChange={(amount) => {
                  setDraft((d) => updateLine(d, index, { amount }));
                }}
                error={errorText(lineField(index, 'amount'), lineCurrency)}
                inputMode="decimal"
              />
              {draft.lines.length > 2 ? (
                <BracketButton
                  tone="destructive"
                  aria-label={t('quickEntry.split.remove', { n: index + 1 })}
                  onPress={() => {
                    setDraft((d) => removeLine(d, index));
                  }}
                >
                  −
                </BracketButton>
              ) : null}
            </FormRow>
          ))}
          <p
            role="status"
            className={
              errors.lines === undefined
                ? 'text-small text-text-muted'
                : 'text-small text-negative'
            }
          >
            {errors.lines === undefined
              ? remainderText(remainder)
              : draftErrorText(errors.lines, example(lineCurrency))}
          </p>
          <div className="flex gap-2">
            <BracketButton
              onPress={() => {
                setDraft(addLine);
              }}
            >
              {t('quickEntry.split.add')}
            </BracketButton>
            <BracketButton
              onPress={() => {
                setDraft(endSplit);
              }}
            >
              {t('quickEntry.split.end')}
            </BracketButton>
          </div>
        </fieldset>
      ) : (
        <>
          <ChoiceField
            label={
              draft.kind === 'transfer'
                ? t('quickEntry.categoryOptional')
                : t('quickEntry.category')
            }
            value={draft.categoryId}
            choices={categoryChoices}
            placeholder={
              draft.kind === 'transfer'
                ? t('quickEntry.noCategory')
                : t('quickEntry.chooseCategory')
            }
            onChange={(categoryId) => {
              patch({ categoryId });
            }}
            error={errorText('categoryId')}
          />
          {draft.kind === 'transfer' ? null : (
            <div>
              <BracketButton
                onPress={() => {
                  setDraft(startSplit);
                }}
              >
                {t('quickEntry.split.start')}
              </BracketButton>
            </div>
          )}
        </>
      )}

      <TextField
        label={t('transactionDetail.edit.payee')}
        value={draft.note}
        onChange={(note) => {
          patch({ note });
        }}
      />
      <FormRow>
        <TextField
          label={t('quickEntry.date')}
          value={draft.occurredOn}
          onChange={(occurredOn) => {
            patch({ occurredOn });
          }}
          placeholder={t('transactionDetail.edit.format')}
          error={errorText('occurredOn')}
        />
        <TextField
          label={t('quickEntry.time')}
          value={draft.occurredTime}
          onChange={(occurredTime) => {
            patch({ occurredTime });
          }}
          placeholder={t('transactionDetail.edit.timeFormat')}
          error={errorText('occurredTime')}
        />
      </FormRow>

      {save.isError ? (
        <p role="alert" className="text-small text-negative">
          {t('transactionDetail.actionFailed')}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <BracketButton onPress={onClose}>
          {t('transactionDetail.edit.cancel')}
        </BracketButton>
        <PrimaryButton type="submit" isDisabled={save.isPending}>
          {save.isPending
            ? t('quickEntry.saving')
            : t('quickEntry.saveChanges')}
        </PrimaryButton>
      </div>
    </form>
  );
}

function remainderText(remainder: ReturnType<typeof splitRemainder>): string {
  if (remainder === null) return t('quickEntry.split.enterAmount');
  if (remainder.amountMinor === 0) return t('quickEntry.split.assigned');
  const amount = formatMoney(
    {
      ...remainder,
      amountMinor: Math.abs(remainder.amountMinor),
    },
    'symbol',
    locale,
  );
  return remainder.amountMinor > 0
    ? t('quickEntry.split.left', { amount })
    : t('quickEntry.split.over', { amount });
}
