import type { AccountView } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { amountExample } from '@/features/quick-entry/draft';
import { ApiError } from '@/lib/api';
import { useCurrencyOptions } from '@/lib/currency-options';
import { createAccount, entryQueryKeys } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import {
  ACCOUNT_FIELD_ORDER,
  newAccountDraft,
  toCreateBody,
  type AccountDraft,
  type AccountDraftErrors,
  type AccountDraftField,
} from './create-draft.ts';

function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAccount,
    // The opening balance is an entry: every view that shows money changes.
    onSuccess: async () => {
      await Promise.all(
        entryQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

export function CreateAccountForm({
  defaultCurrency,
  today,
  locale,
  group,
  autoFocus = true,
  onCreated,
  onBusyChange,
}: {
  defaultCurrency: string;
  today: string;
  locale: string;
  /** Fixes the budget group and hides its choice. */
  group?: AccountView['budgetGroup'];
  autoFocus?: boolean;
  onCreated: (account: AccountView) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState<AccountDraft>(() => ({
    ...newAccountDraft(defaultCurrency, today),
    ...(group === undefined ? {} : { budgetGroup: group }),
  }));
  const [errors, setErrors] = useState<AccountDraftErrors>({});
  const [nameTaken, setNameTaken] = useState(false);
  const [failure, setFailure] = useState<{
    count: number;
    first: AccountDraftField | undefined;
  } | null>(null);
  const [summary, setSummary] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const groupName = useId();
  const currencyOptions = useCurrencyOptions(locale);
  const create = useCreateAccount();
  const busy = create.isPending;
  useEffect(() => {
    onBusyChange(busy);
    return () => {
      onBusyChange(false);
    };
  }, [busy, onBusyChange]);

  // As in quick entry: focus and the summary wait for the render that shows
  // the field errors, so both are announced on every failed save.
  useEffect(() => {
    if (failure === null) return;
    const element =
      failure.first === undefined
        ? null
        : form.current?.elements.namedItem(failure.first);
    if (element instanceof HTMLElement) element.focus();
    const frame = requestAnimationFrame(() => {
      setSummary(t('errors.validationSummary', { count: failure.count }));
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [failure]);

  const update = (patch: Partial<AccountDraft>) => {
    if (create.isError) create.reset();
    if (patch.name !== undefined) setNameTaken(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const fail = (next: AccountDraftErrors, taken: boolean) => {
    setErrors(next);
    setNameTaken(taken);
    setSummary('');
    setFailure({
      count: Object.keys(next).length + (taken ? 1 : 0),
      first: taken
        ? 'name'
        : ACCOUNT_FIELD_ORDER.find((field) => next[field] !== undefined),
    });
  };

  const errorText = (field: AccountDraftField): string | undefined => {
    if (field === 'name' && nameTaken)
      return t('accounts.create.errors.nameTaken');
    const key = errors[field];
    if (key === undefined) return undefined;
    return key === 'accounts.create.errors.balanceInvalid'
      ? t(key, { example: amountExample(draft.currency, locale) })
      : t(key);
  };
  const hasBalance = draft.openingBalance.trim() !== '';

  return (
    <form
      ref={form}
      noValidate
      className="mt-6 grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const result = toCreateBody(draft, locale);
        if (!result.ok) {
          fail(result.errors, false);
          return;
        }
        setErrors({});
        setFailure(null);
        setSummary('');
        create.mutate(result.body, {
          onSuccess: onCreated,
          onError: (error) => {
            if (
              error instanceof ApiError &&
              error.problem.code === 'account_name_taken'
            ) {
              create.reset();
              fail({}, true);
            }
          },
        });
      }}
    >
      <FieldControl label={t('accounts.create.name')} error={errorText('name')}>
        {(props) => (
          <Input
            {...props}
            name="name"
            maxLength={100}
            autoComplete="off"
            autoFocus={autoFocus}
            className="h-11 text-base"
            value={draft.name}
            onChange={(e) => {
              update({ name: e.currentTarget.value });
            }}
          />
        )}
      </FieldControl>

      <FieldControl
        label={t('accounts.create.currency')}
        hint={t('accounts.create.currencyHint')}
        error={errorText('currency')}
      >
        {(props) => (
          <select
            {...props}
            name="currency"
            className={selectClass}
            value={draft.currency}
            onChange={(e) => {
              update({ currency: e.currentTarget.value });
            }}
          >
            {currencyOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </FieldControl>

      {group === undefined ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            {t('accounts.create.group')}
          </legend>
          <div className="grid gap-2">
            {(['on', 'off'] as const).map((group) => (
              <label
                key={group}
                className="flex cursor-pointer gap-3 rounded-md border border-input p-3 has-checked:border-primary has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background"
              >
                <input
                  type="radio"
                  name={groupName}
                  value={group}
                  checked={draft.budgetGroup === group}
                  onChange={() => {
                    update({ budgetGroup: group });
                  }}
                  className="mt-1 accent-primary"
                />
                <span className="grid gap-0.5">
                  <span className="font-medium">
                    {t(`accounts.groups.${group}`)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(`accounts.groups.${group}Hint`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <FieldControl
        label={t('accounts.create.balance', { currency: draft.currency })}
        hint={t('accounts.create.balanceHint')}
        error={errorText('openingBalance')}
      >
        {(props) => (
          <Input
            {...props}
            name="openingBalance"
            inputMode="decimal"
            autoComplete="off"
            className="h-11 text-base"
            value={draft.openingBalance}
            onChange={(e) => {
              update({ openingBalance: e.currentTarget.value });
            }}
          />
        )}
      </FieldControl>

      {hasBalance ? (
        <FieldControl
          label={t('accounts.create.openedOn')}
          error={errorText('openedOn')}
        >
          {(props) => (
            <Input
              {...props}
              name="openedOn"
              type="date"
              className="h-11 text-base"
              value={draft.openedOn}
              onChange={(e) => {
                update({ openedOn: e.currentTarget.value });
              }}
            />
          )}
        </FieldControl>
      ) : null}

      <FormError
        message={
          summary === ''
            ? create.isError
              ? describeProblem(create.error).message
              : null
            : summary
        }
      />
      <Button type="submit" className="h-11 w-full" disabled={busy}>
        {busy ? t('accounts.create.saving') : t('accounts.create.save')}
      </Button>
    </form>
  );
}
