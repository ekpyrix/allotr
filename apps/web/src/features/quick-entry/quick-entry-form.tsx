import {
  formatMoney,
  type AccountView,
  type CategoryView,
  type CreateTransactionBody,
} from '@allotr/shared';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type SubmitEvent,
  type KeyboardEvent,
} from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import {
  ENTRY_KINDS,
  FIELD_ORDER,
  keyForBody,
  toBody,
  type DraftErrors,
  type DraftKey,
  type QuickEntryDraft,
} from './draft.ts';
import { readLastUsed, rememberChoice } from './last-used.ts';
import {
  categoryOptions,
  newDraft,
  switchKind,
  type DraftDefaults,
} from './options.ts';
import { useSaveEntry } from './use-save-entry.ts';

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function savedMessage(body: CreateTransactionBody, locale: string): string {
  const amount = formatMoney(
    body.kind === 'transfer' ? body.sent : body.amount,
    locale,
  );
  return t(`quickEntry.saved.${body.kind}`, { amount });
}

// Browsers submit on Enter only from text inputs; the form is keyboard-first,
// so Enter on a select, radio or checkbox saves too. Buttons keep their own
// Enter (Close must close).
function submitOnEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  if (event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  event.currentTarget.requestSubmit();
}

export function QuickEntryForm({
  accounts,
  categories,
  tags,
  locale,
  today,
  onSaved,
  onSavingChange,
}: {
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  tags: readonly { id: string; name: string }[];
  locale: string;
  today: string;
  onSaved: (message: string) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [defaults] = useState<DraftDefaults>(() => ({
    accounts,
    categories,
    today,
    lastUsed: readLastUsed(storage()),
  }));
  const [draft, setDraft] = useState(() => newDraft(defaults));
  const [errors, setErrors] = useState<DraftErrors>({});
  const save = useSaveEntry();
  const saving = save.isPending;
  useEffect(() => {
    onSavingChange(saving);
    return () => {
      onSavingChange(false);
    };
  }, [saving, onSavingChange]);
  const key = useRef<DraftKey | null>(null);
  const inFlight = useRef(false);
  const kindName = useId();

  const update = (patch: Partial<QuickEntryDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const error = (field: keyof DraftErrors) => {
    const message = errors[field];
    return message === undefined ? undefined : t(message);
  };
  const source = accounts.find((a) => a.id === draft.accountId);
  const target = accounts.find((a) => a.id === draft.toAccountId);
  const transfer = draft.kind === 'transfer';
  const needsReceived =
    transfer &&
    source !== undefined &&
    target !== undefined &&
    source.currency !== target.currency;
  const options = categoryOptions(categories, draft.kind);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const result = toBody(draft, { accounts, locale });
    if (!result.ok) {
      setErrors(result.errors);
      const first = FIELD_ORDER.find(
        (field) => result.errors[field] !== undefined,
      );
      const element =
        first === undefined
          ? null
          : event.currentTarget.elements.namedItem(first);
      if (element instanceof HTMLElement) element.focus();
      return;
    }
    setErrors({});
    key.current = keyForBody(key.current, result.body, () =>
      crypto.randomUUID(),
    );
    inFlight.current = true;
    save.mutate(
      { body: result.body, idempotencyKey: key.current.key },
      {
        onSuccess: () => {
          key.current = null;
          rememberChoice(storage(), draft);
          onSaved(savedMessage(result.body, locale));
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={submitOnEnter}
      className="mt-6 grid gap-5"
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          {t('quickEntry.kind')}
        </legend>
        <div className="grid grid-cols-3 rounded-md border border-input p-0.5 text-sm">
          {ENTRY_KINDS.map((kind) => (
            <label
              key={kind}
              className="cursor-pointer rounded-sm px-2.5 py-2 text-center text-muted-foreground has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background"
            >
              <input
                type="radio"
                name={kindName}
                value={kind}
                checked={draft.kind === kind}
                onChange={() => {
                  setDraft((current) => switchKind(current, kind, defaults));
                  setErrors({});
                }}
                className="sr-only"
              />
              {t(`quickEntry.kinds.${kind}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <FieldControl
        label={
          source === undefined
            ? t('quickEntry.amount')
            : t('quickEntry.amountIn', { currency: source.currency })
        }
        error={error('amount')}
      >
        {(props) => (
          <Input
            {...props}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            className="h-11 text-base"
            value={draft.amount}
            onChange={(e) => {
              update({ amount: e.currentTarget.value });
            }}
          />
        )}
      </FieldControl>

      <FieldControl
        label={transfer ? t('quickEntry.fromAccount') : t('quickEntry.account')}
        error={error('accountId')}
      >
        {(props) => (
          <select
            {...props}
            name="accountId"
            className={selectClass}
            value={draft.accountId}
            onChange={(e) => {
              update({ accountId: e.currentTarget.value });
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </FieldControl>

      {transfer ? (
        <FieldControl
          label={t('quickEntry.toAccount')}
          error={error('toAccountId')}
        >
          {(props) => (
            <select
              {...props}
              name="toAccountId"
              className={selectClass}
              value={draft.toAccountId}
              onChange={(e) => {
                update({ toAccountId: e.currentTarget.value });
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </FieldControl>
      ) : null}

      {needsReceived ? (
        <FieldControl
          label={t('quickEntry.receivedIn', { currency: target.currency })}
          error={error('received')}
        >
          {(props) => (
            <Input
              {...props}
              name="received"
              inputMode="decimal"
              autoComplete="off"
              className="h-11 text-base"
              value={draft.received}
              onChange={(e) => {
                update({ received: e.currentTarget.value });
              }}
            />
          )}
        </FieldControl>
      ) : null}

      <FieldControl
        label={
          transfer ? t('quickEntry.categoryOptional') : t('quickEntry.category')
        }
        error={error('categoryId')}
      >
        {(props) => (
          <select
            {...props}
            name="categoryId"
            className={selectClass}
            value={draft.categoryId}
            onChange={(e) => {
              update({ categoryId: e.currentTarget.value });
            }}
          >
            {transfer ? (
              <option value="">{t('quickEntry.noCategory')}</option>
            ) : (
              <option value="" disabled>
                {t('quickEntry.chooseCategory')}
              </option>
            )}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </FieldControl>

      <FieldControl label={t('quickEntry.date')} error={error('occurredOn')}>
        {(props) => (
          <Input
            {...props}
            name="occurredOn"
            type="date"
            className="h-11 text-base"
            value={draft.occurredOn}
            onChange={(e) => {
              update({ occurredOn: e.currentTarget.value });
            }}
          />
        )}
      </FieldControl>

      <FieldControl label={t('quickEntry.note')}>
        {(props) => (
          <Input
            {...props}
            name="note"
            maxLength={500}
            autoComplete="off"
            className="h-11 text-base"
            value={draft.note}
            onChange={(e) => {
              update({ note: e.currentTarget.value });
            }}
          />
        )}
      </FieldControl>

      {tags.length === 0 ? null : (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            {t('quickEntry.tags')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className="cursor-pointer rounded-full border border-input px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={draft.tagIds.includes(tag.id)}
                  onChange={(e) => {
                    const on = e.currentTarget.checked;
                    setDraft((current) => ({
                      ...current,
                      tagIds: on
                        ? [...current.tagIds, tag.id]
                        : current.tagIds.filter((id) => id !== tag.id),
                    }));
                  }}
                />
                {tag.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <FormError
        message={save.isError ? describeProblem(save.error).message : null}
      />
      <Button
        type="submit"
        size="lg"
        className="h-11 w-full"
        disabled={save.isPending}
      >
        {save.isPending ? t('quickEntry.saving') : t('quickEntry.save')}
      </Button>
    </form>
  );
}
