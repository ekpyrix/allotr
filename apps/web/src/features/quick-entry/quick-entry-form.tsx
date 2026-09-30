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
import { Split } from 'lucide-react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import {
  addLine,
  amountExample,
  draftErrorText,
  endSplit,
  ENTRY_KINDS,
  fieldOrder,
  isSplit,
  keyForBody,
  lineField,
  removeLine,
  splitCurrency,
  splitRemainder,
  startSplit,
  toBody,
  updateLine,
  type DraftErrors,
  type DraftField,
  type DraftKey,
  type QuickEntryDraft,
} from './draft.ts';
import { readLastUsed, rememberChoice } from './last-used.ts';
import {
  categoryOptions,
  newDraft,
  switchKind,
  withToday,
  type DraftDefaults,
} from './options.ts';
import { SplitEditor } from './split-editor.tsx';
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
  edit,
}: {
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  tags: readonly { id: string; name: string }[];
  locale: string;
  today: string;
  /** Called with what to announce and the ID of the saved entry. */
  onSaved: (message: string, entryId: string) => void;
  onSavingChange: (saving: boolean) => void;
  /** Replace this entry instead of recording a new one. */
  edit?: { id: string; draft: QuickEntryDraft } | undefined;
}) {
  const [defaults] = useState<DraftDefaults>(() => ({
    accounts,
    categories,
    today,
    lastUsed: readLastUsed(storage()),
  }));
  const [typed, setDraft] = useState(() => edit?.draft ?? newDraft(defaults));
  // Until the user picks a date it follows `today`, which can be corrected
  // by a refetch after the form opened on a cached value. An edit keeps the
  // entry's own date.
  const [dateEdited, setDateEdited] = useState(edit !== undefined);
  const draft = withToday(typed, today, dateEdited);
  const [errors, setErrors] = useState<DraftErrors>({});
  // Set after the failed field errors are on screen, so the alert changes
  // (empty, then text) on every failed save and is announced again.
  const [failure, setFailure] = useState<{
    count: number;
    first: DraftField | undefined;
  } | null>(null);
  const [summary, setSummary] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const save = useSaveEntry(edit?.id);
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

  // Focus and the summary wait for the render that shows the field errors:
  // focusing inside the submit handler would run before aria-invalid and
  // aria-describedby exist, and say nothing when the field already has focus.
  useEffect(() => {
    if (failure === null) return;
    const element =
      failure.first === undefined
        ? null
        : failure.first === 'lines'
          ? form.current?.querySelector('[data-split-status]')
          : form.current?.elements.namedItem(failure.first);
    if (element instanceof HTMLElement) element.focus();
    const frame = requestAnimationFrame(() => {
      setSummary(t('errors.validationSummary', { count: failure.count }));
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [failure]);

  const clearErrors = () => {
    setErrors({});
    setFailure(null);
    setSummary('');
  };
  // A server error is about the request that was sent, not the next edit.
  const editing = () => {
    if (save.isError) save.reset();
  };
  const update = (patch: Partial<QuickEntryDraft>) => {
    editing();
    setDraft((current) => ({ ...current, ...patch }));
  };
  const change = (next: (current: QuickEntryDraft) => QuickEntryDraft) => {
    editing();
    setDraft(next);
  };
  // The split controls add and remove the button that was pressed, so
  // focus moves to where the user goes on typing once the change renders.
  const focusNext = useRef<DraftField | null>(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    const element = form.current?.elements.namedItem(focusNext.current);
    focusNext.current = null;
    if (element instanceof HTMLElement) element.focus();
  });
  const source = accounts.find((a) => a.id === draft.accountId);
  const target = accounts.find((a) => a.id === draft.toAccountId);
  const transfer = draft.kind === 'transfer';
  const needsReceived =
    transfer &&
    source !== undefined &&
    target !== undefined &&
    source.currency !== target.currency;
  const options = categoryOptions(categories, draft.kind);
  const split = !transfer && isSplit(draft);
  const linesCurrency = splitCurrency(draft, accounts);
  const error = (field: DraftField, currency: string | undefined) => {
    const message = errors[field];
    return message === undefined
      ? undefined
      : draftErrorText(
          message,
          amountExample(currency ?? accounts[0]?.currency ?? 'USD', locale),
        );
  };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const result = toBody(draft, { accounts, locale });
    if (!result.ok) {
      setErrors(result.errors);
      setSummary('');
      setFailure({
        count: Object.keys(result.errors).length,
        first: fieldOrder(draft).find(
          (field) => result.errors[field] !== undefined,
        ),
      });
      return;
    }
    clearErrors();
    key.current = keyForBody(key.current, result.body, () =>
      crypto.randomUUID(),
    );
    inFlight.current = true;
    save.mutate(
      { body: result.body, idempotencyKey: key.current.key },
      {
        onSuccess: (entryId) => {
          key.current = null;
          // Last used is for new entries; an edit is a correction.
          if (edit === undefined) rememberChoice(storage(), draft);
          onSaved(savedMessage(result.body, locale), entryId);
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  }

  return (
    <form
      ref={form}
      noValidate
      onSubmit={submit}
      onKeyDown={submitOnEnter}
      className="mt-6 grid gap-5"
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          {t('quickEntry.kind')}
        </legend>
        <div className="grid grid-cols-3 rounded-md border border-outline p-0.5 text-sm">
          {ENTRY_KINDS.map((kind) => (
            <label
              key={kind}
              className="cursor-pointer rounded-sm px-2.5 py-2 text-center text-text-muted has-checked:bg-primary has-checked:text-on-primary has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-canvas"
            >
              <input
                type="radio"
                name={kindName}
                value={kind}
                checked={draft.kind === kind}
                onChange={() => {
                  editing();
                  setDraft((current) => switchKind(current, kind, defaults));
                  clearErrors();
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
        error={error('amount', source?.currency)}
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
        error={error('accountId', undefined)}
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
          error={error('toAccountId', undefined)}
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
          error={error('received', target.currency)}
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

      {!transfer && draft.foreignCurrency !== '' ? (
        <FieldControl
          label={t('quickEntry.priceIn', { currency: draft.foreignCurrency })}
          hint={t('quickEntry.priceHint')}
          error={error('foreign', draft.foreignCurrency)}
        >
          {(props) => (
            <Input
              {...props}
              name="foreign"
              inputMode="decimal"
              autoComplete="off"
              className="h-11 text-base"
              value={draft.foreign}
              onChange={(e) => {
                update({ foreign: e.currentTarget.value });
              }}
            />
          )}
        </FieldControl>
      ) : null}

      {split ? (
        <SplitEditor
          lines={draft.lines}
          options={options}
          currency={linesCurrency}
          remainder={splitRemainder(draft, { accounts, locale })}
          locale={locale}
          error={(field) => error(field, linesCurrency)}
          mismatch={error('lines', linesCurrency)}
          onLine={(index, patch) => {
            change((current) => updateLine(current, index, patch));
          }}
          onAdd={() => {
            focusNext.current = lineField(draft.lines.length, 'categoryId');
            change(addLine);
          }}
          onRemove={(index) => {
            focusNext.current = lineField(
              Math.min(index, draft.lines.length - 2),
              'categoryId',
            );
            change((current) => removeLine(current, index));
          }}
          onEnd={() => {
            focusNext.current = 'categoryId';
            change(endSplit);
            clearErrors();
          }}
        />
      ) : (
        <div className="grid gap-2">
          <FieldControl
            label={
              transfer
                ? t('quickEntry.categoryOptional')
                : t('quickEntry.category')
            }
            error={error('categoryId', undefined)}
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
          {transfer ? null : (
            <Button
              type="button"
              variant="outlined"
              className="justify-self-start"
              onClick={() => {
                // The chosen category is already the first line's.
                focusNext.current = lineField(
                  0,
                  draft.categoryId === '' ? 'categoryId' : 'amount',
                );
                change(startSplit);
                clearErrors();
              }}
            >
              <Split aria-hidden />
              {t('quickEntry.split.start')}
            </Button>
          )}
        </div>
      )}

      <FieldControl
        label={t('quickEntry.date')}
        error={error('occurredOn', undefined)}
      >
        {(props) => (
          <Input
            {...props}
            name="occurredOn"
            type="date"
            className="h-11 text-base"
            value={draft.occurredOn}
            onChange={(e) => {
              setDateEdited(true);
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
                className="cursor-pointer rounded-full border border-outline px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary has-checked:text-on-primary has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-canvas"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={draft.tagIds.includes(tag.id)}
                  onChange={(e) => {
                    const on = e.currentTarget.checked;
                    editing();
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
        message={
          summary === ''
            ? save.isError
              ? describeProblem(save.error).message
              : null
            : summary
        }
      />
      <Button
        type="submit"

        className="h-11 w-full"
        disabled={save.isPending}
      >
        {save.isPending
          ? t('quickEntry.saving')
          : edit === undefined
            ? t('quickEntry.save')
            : t('quickEntry.saveChanges')}
      </Button>
    </form>
  );
}
