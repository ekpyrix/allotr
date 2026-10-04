import {
  formatMoney,
  localTimeIn,
  type CoverPreviewView,
  type AccountView,
  type CategoryView,
  type CreateTransactionBody,
  type EntryTimes,
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
import { useQueryClient } from '@tanstack/react-query';
import { describeProblem } from '@/lib/problem';
import { randomId } from '@/lib/random-id';
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
import {
  CoverPreview,
  coverKey,
  coverPreviewOptions,
  coverRequest,
  useCoverPreview,
} from '@/features/budget/cover-preview';
import {
  fillEven,
  positive,
  toSplitBody,
  type PersonDraft,
  type PersonError,
  type TotalError,
} from '@/features/ious/draft';
import { SplitPeople } from '@/features/ious/split-people';
import { useConvertSave, useSplitSave } from '@/features/ious/use-split-save';
import { previewIouCover } from '@/lib/ious';
import { readLastUsed, rememberChoice } from './last-used.ts';
import {
  categoryOptions,
  newDraft,
  paycheckDraft,
  switchKind,
  withTime,
  withToday,
  type DraftDefaults,
} from './options.ts';
import { SplitEditor } from './split-editor.tsx';
import { useSaveEntry } from './use-save-entry.ts';
import { reformatAmountInput } from '@/lib/amount-input.ts';

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
  entryTimes = 'off',
  timeZone = 'UTC',
  onSaved,
  onSavingChange,
  edit,
  preset,
  stickyActions = false,
}: {
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  tags: readonly { id: string; name: string }[];
  locale: string;
  today: string;
  /** Whether entries take a time of day (the `entryTimes` setting). */
  entryTimes?: EntryTimes | undefined;
  /** The user's time zone, for the current time. */
  timeZone?: string | undefined;
  /** Called with what to announce and the ID of the saved entry. */
  onSaved: (message: string, entryId: string) => void;
  onSavingChange: (saving: boolean) => void;
  /** Replace this entry instead of recording a new one. */
  edit?: { id: string; draft: QuickEntryDraft } | undefined;
  /** Start from an income entry in the paycheck category. */
  preset?: 'paycheck' | undefined;
  /**
   * Keep the error summary and Save pinned to the bottom of a scrolling
   * sheet (the quick entry dialog, whose padding the bar spans).
   */
  stickyActions?: boolean | undefined;
}) {
  const [defaults] = useState<DraftDefaults>(() => ({
    accounts,
    categories,
    today,
    lastUsed: readLastUsed(storage()),
  }));
  const [typed, setDraft] = useState(
    () =>
      edit?.draft ??
      (preset === 'paycheck' ? paycheckDraft(defaults) : newDraft(defaults)),
  );
  // Until the user picks a date it follows `today`, which can be corrected
  // by a refetch after the form opened on a cached value. An edit keeps the
  // entry's own date.
  const [dateEdited, setDateEdited] = useState(edit !== undefined);
  // The same for the time when entry times are filled in: it is the time
  // the form opened, for today's entries, until the user changes it.
  const [timeEdited, setTimeEdited] = useState(edit !== undefined);
  const [openedAt] = useState(() => new Date());
  const draft = withTime(
    withToday(typed, today, dateEdited),
    today,
    entryTimes === 'prefill-now' ? localTimeIn(openedAt, timeZone) : null,
    timeEdited,
  );
  // An entry that has a time keeps the field, whatever the setting says.
  const showTime = entryTimes !== 'off' || draft.occurredTime !== '';
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
  const queryClient = useQueryClient();
  const splitSave = useSplitSave();
  const convertSave = useConvertSave();
  // Splitting with people (ADR 0024): null when off; the typed amount is
  // then the whole bill, and the user's share is what people do not owe.
  const [people, setPeople] = useState<readonly PersonDraft[] | null>(null);
  const [peopleErrors, setPeopleErrors] = useState<
    Readonly<Record<number, PersonError>>
  >({});
  const [totalError, setTotalError] = useState<TotalError | undefined>();
  const [splitWarning, setSplitWarning] = useState<CoverPreviewView | null>(
    null,
  );
  const splitKey = useRef<string | null>(null);
  // The cover request the user has already confirmed with a second tap.
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const saving = save.isPending || splitSave.isPending || convertSave.isPending;
  // Splitting an entry being edited keeps its bill: the account, amount and
  // date stay what was logged, so only the people and category change.
  const converting = edit !== undefined && people !== null;
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
    if (splitSave.isError) splitSave.reset();
    if (convertSave.isError) convertSave.reset();
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
  const built =
    draft.kind === 'expense' && edit === undefined && !split && people === null
      ? toBody(draft, { accounts, locale })
      : null;
  const coverAsk = coverRequest(built?.ok === true ? built.body : null);
  const { preview, key: previewKey } = useCoverPreview(coverAsk);
  const askKey = coverKey(coverAsk);
  const needsSecondTap =
    preview?.needsConfirmation === true &&
    previewKey === askKey &&
    confirmed !== askKey;
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
    const body = result.body;
    if (people !== null && body.kind === 'expense') {
      if (edit === undefined) submitSplit(body, people);
      else submitConvert(edit.id, body, people);
      return;
    }
    const request = edit === undefined ? coverRequest(body) : null;
    if (request === null) {
      record(body);
      return;
    }
    // The cover can reach money set aside: ask the server now, so the
    // second tap is required even when the preview had not settled yet.
    inFlight.current = true;
    const asked = coverKey(request);
    void queryClient
      .query(coverPreviewOptions(request))
      .then((cover) => {
        if (cover.needsConfirmation && confirmed !== asked) {
          setConfirmed(asked);
          inFlight.current = false;
          return;
        }
        inFlight.current = false;
        record(body);
      })
      .catch(() => {
        // The preview is advice; saving does not depend on it.
        inFlight.current = false;
        record(body);
      });
  }

  function submitSplit(
    body: Extract<CreateTransactionBody, { kind: 'expense' }>,
    shares: readonly PersonDraft[],
  ) {
    const built = toSplitBody(
      body,
      fillEven(shares, body.amount, locale),
      locale,
    );
    if (!built.ok) {
      setPeopleErrors(built.errors);
      setTotalError(built.total);
      return;
    }
    setPeopleErrors({});
    setTotalError(undefined);
    const askedFor = JSON.stringify(built.body);
    const send = () => {
      splitKey.current ??= randomId();
      splitSave.mutate(
        { body: built.body, key: splitKey.current },
        {
          onSuccess: (created) => {
            splitKey.current = null;
            const own = built.body.ownShare?.amount;
            onSaved(
              own === undefined
                ? t('budget.ious.lent', {
                    amount: formatMoney(body.amount, locale),
                  })
                : t('budget.ious.saved', { amount: formatMoney(own, locale) }),
              created.transaction.id,
            );
          },
          onSettled: () => {
            inFlight.current = false;
          },
        },
      );
    };
    inFlight.current = true;
    void queryClient
      .query({
        queryKey: ['today', 'budgets', 'iou-cover-preview', askedFor],
        queryFn: () => previewIouCover(built.body),
        staleTime: 10_000,
        retry: false,
        networkMode: 'always',
      })
      .then((cover) => {
        if (cover.needsConfirmation && confirmed !== askedFor) {
          setConfirmed(askedFor);
          setSplitWarning(cover);
          inFlight.current = false;
          return;
        }
        send();
      })
      .catch(() => {
        send();
      });
  }

  function submitConvert(
    id: string,
    body: Extract<CreateTransactionBody, { kind: 'expense' }>,
    shares: readonly PersonDraft[],
  ) {
    const built = toSplitBody(
      body,
      fillEven(shares, body.amount, locale),
      locale,
    );
    if (!built.ok) {
      setPeopleErrors(built.errors);
      setTotalError(built.total);
      return;
    }
    setPeopleErrors({});
    setTotalError(undefined);
    splitKey.current ??= randomId();
    inFlight.current = true;
    const own = built.body.ownShare;
    convertSave.mutate(
      {
        id,
        body: {
          people: built.body.people,
          ...(own === undefined ? {} : { categoryId: own.categoryId }),
        },
        key: splitKey.current,
      },
      {
        onSuccess: (converted) => {
          splitKey.current = null;
          onSaved(
            own === undefined
              ? t('budget.ious.lent', {
                  amount: formatMoney(body.amount, locale),
                })
              : t('budget.ious.saved', {
                  amount: formatMoney(own.amount, locale),
                }),
            converted.transaction.id,
          );
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  }

  function record(body: CreateTransactionBody) {
    if (inFlight.current) return;
    key.current = keyForBody(key.current, body, () => randomId());
    inFlight.current = true;
    save.mutate(
      { body, idempotencyKey: key.current.key },
      {
        onSuccess: (entryId) => {
          key.current = null;
          // Last used is for new entries; an edit is a correction.
          if (edit === undefined) rememberChoice(storage(), draft);
          onSaved(savedMessage(body, locale), entryId);
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
            readOnly={converting}
            value={draft.amount}
            onChange={(e) => {
              update({ amount: e.currentTarget.value });
            }}
            onBlur={(e) => {
              update({
                amount: reformatAmountInput(
                  e.currentTarget.value,
                  source?.currency,
                  locale,
                ),
              });
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
            disabled={converting}
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
              onBlur={(e) => {
                update({
                  received: reformatAmountInput(
                    e.currentTarget.value,
                    target.currency,
                    locale,
                  ),
                });
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
              onBlur={(e) => {
                update({
                  foreign: reformatAmountInput(
                    e.currentTarget.value,
                    draft.foreignCurrency,
                    locale,
                  ),
                });
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
            readOnly={converting}
            value={draft.occurredOn}
            onChange={(e) => {
              setDateEdited(true);
              update({ occurredOn: e.currentTarget.value });
            }}
          />
        )}
      </FieldControl>

      {showTime ? (
        <FieldControl
          label={t('quickEntry.time')}
          error={error('occurredTime', undefined)}
        >
          {(props) => (
            <Input
              {...props}
              name="occurredTime"
              type="time"
              className="h-11 text-base"
              readOnly={converting}
              value={draft.occurredTime}
              onChange={(e) => {
                setTimeEdited(true);
                update({ occurredTime: e.currentTarget.value });
              }}
            />
          )}
        </FieldControl>
      ) : null}

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

      {draft.kind === 'expense' &&
      !split &&
      (edit === undefined ||
        (edit.draft.kind === 'expense' &&
          edit.draft.lines.length === 0 &&
          edit.draft.foreignCurrency === '')) ? (
        <SplitPeople
          people={people}
          errors={peopleErrors}
          totalError={totalError}
          total={positive(draft.amount, source?.currency ?? 'USD', locale)}
          currency={source?.currency ?? 'USD'}
          locale={locale}
          onChange={(next) => {
            // An entry being split goes back to its bill as logged.
            if (edit !== undefined && people === null && next !== null)
              update({
                amount: edit.draft.amount,
                accountId: edit.draft.accountId,
                occurredOn: edit.draft.occurredOn,
              });
            setPeople(next);
            setPeopleErrors({});
            setTotalError(undefined);
            setSplitWarning(null);
          }}
        />
      ) : null}
      {splitWarning !== null ? (
        <CoverPreview preview={splitWarning} locale={locale} />
      ) : null}
      {preview !== undefined && previewKey === askKey ? (
        <CoverPreview preview={preview} locale={locale} />
      ) : null}

      <div
        className={
          stickyActions
            ? 'sticky bottom-0 z-[1] -mx-6 grid gap-3 border-t border-outline-variant bg-card-raised px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]'
            : 'grid gap-5'
        }
      >
        <FormError
          message={
            summary === ''
              ? (() => {
                  const failed = [save, splitSave, convertSave].find(
                    (m) => m.isError,
                  )?.error;
                  return failed == null
                    ? null
                    : describeProblem(failed).message;
                })()
              : summary
          }
        />
        <Button type="submit" className="h-11 w-full" disabled={saving}>
          {saving
            ? t('quickEntry.saving')
            : needsSecondTap
              ? t('budget.preview.saveAnyway')
              : edit === undefined
                ? t('quickEntry.save')
                : t('quickEntry.saveChanges')}
        </Button>
      </div>
    </form>
  );
}
