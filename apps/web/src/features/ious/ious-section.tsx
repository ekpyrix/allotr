import {
  formatMoney,
  formatMoneyInput,
  money,
  isLocalDate,
  localDate,
  type AccountView,
  type CategoryView,
  type CurrencyCode,
  type IouListView,
  type IouSettlementView,
  type IouView,
  type LocalDate,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, HandCoins, TriangleAlert } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSnackbar } from '@/components/ui/snackbar';
import { StatusChip } from '@/components/ui/status-chip';
import { Sheet } from '@/features/accounts/sheet';
import { MoneyInput } from '@/features/budget/money-input';
import { formatLongDay } from '@/features/ledger/format';
import { useDeleteEntry } from '@/features/ledger/use-delete-entry';
import { categoryOptions } from '@/features/quick-entry/options';
import {
  parseBillAmount,
  type AmountError,
} from '@/features/settings/bill-draft';
import { Section } from '@/features/settings/section';
import { useBusy } from '@/features/settings/use-busy';
import {
  allIousQuery,
  createIou,
  iouQueryKeys,
  repayIous,
  updateIou,
  writeOffIou,
} from '@/lib/ious';
import { ApiError } from '@/lib/api';
import { describeProblem, errorMessage } from '@/lib/problem';
import { randomId } from '@/lib/random-id';
import { invalidate } from '@/lib/settings';
import { t } from '@/messages/t';
import {
  parseEntryDate,
  toLoanBody,
  type DateError,
  type PersonError,
} from './draft.ts';
import { PeopleInput } from './people-input.tsx';

// Every lend, borrow, repayment and write-off is an entry of its own: it
// can be undone right after it is saved, and deleted later like any entry
// (its undo restores it). An IOU's payments are listed under it.

type Open =
  | { kind: 'loan' }
  | { kind: 'repay' | 'writeoff' | 'edit' | 'delete'; iou: IouView }
  | null;

/** An entry just saved: its id, and what the messages call it. */
interface Saved {
  id: string;
  description: string;
}

interface FormProps {
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  locale: string;
  /** The user's today; each entry is dated today unless changed. */
  today: LocalDate;
  onDone: (saved?: Saved) => void;
  onBusyChange: (busy: boolean) => void;
}

/** When the money moved; a payment cannot be dated before its IOU. */
function EntryDate({
  value,
  onChange,
  error,
  notBefore,
  locale,
}: {
  value: string;
  onChange: (value: string) => void;
  error: DateError | undefined;
  notBefore?: LocalDate | undefined;
  locale: string;
}) {
  return (
    <FieldControl
      label={t('budget.ious.date')}
      error={
        error === undefined
          ? undefined
          : error === 'invalid'
            ? t('budget.ious.errors.date')
            : t('budget.ious.errors.beforeIou', {
                date: formatLongDay(notBefore ?? localDate(value), locale),
              })
      }
    >
      {(props) => (
        <Input
          {...props}
          type="date"
          name="occurredOn"
          min={notBefore}
          value={value}
          onChange={(e) => {
            onChange(e.currentTarget.value);
          }}
        />
      )}
    </FieldControl>
  );
}

type EntryKind = 'origin' | 'repayment' | 'write-off';

/** What an IOU's entry is called, as in "Deleted repayment from Alex." */
export function entryName(
  kind: EntryKind,
  iou: Pick<IouView, 'direction' | 'person'>,
): string {
  const toMe = iou.direction === 'owed-to-me';
  const key =
    kind === 'origin'
      ? toMe
        ? 'lentTo'
        : 'borrowedFrom'
      : kind === 'repayment'
        ? toMe
          ? 'repaidBy'
          : 'paidTo'
        : 'writtenOff';
  return t(`budget.ious.entries.${key}`, { person: iou.person });
}

function useIouChange<A, R>(
  run: (args: A) => Promise<R>,
  onDone: (result: R) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (result) => {
      await invalidate(queryClient, iouQueryKeys);
      onDone(result);
    },
  });
}

function AccountSelect({
  accounts,
  currency,
  value,
  onChange,
  label,
}: {
  accounts: readonly AccountView[];
  currency?: string | undefined;
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const options = accounts.filter(
    (a) => !a.archived && (currency === undefined || a.currency === currency),
  );
  return (
    <FieldControl label={label}>
      {(props) => (
        <select
          {...props}
          name="accountId"
          value={value}
          className={selectClass}
          onChange={(e) => {
            onChange(e.currentTarget.value);
          }}
        >
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
    </FieldControl>
  );
}

function LoanForm({
  accounts,
  locale,
  today,
  onDone,
  onBusyChange,
}: Omit<FormProps, 'categories'>) {
  const open = accounts.filter((a) => !a.archived);
  const [direction, setDirection] = useState<'owed-to-me' | 'owed-by-me'>(
    'owed-to-me',
  );
  const [accountId, setAccountId] = useState(open[0]?.id ?? '');
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState('');
  const [occurredOn, setOccurredOn] = useState<string>(today);
  const [error, setError] = useState<PersonError>();
  const [dateError, setDateError] = useState<DateError>();
  const [key] = useState(() => randomId());
  const create = useIouChange(
    (body: Parameters<typeof createIou>[0]) => createIou(body, key),
    ({ transaction, ious }) => {
      const [first] = ious;
      onDone(
        first === undefined
          ? undefined
          : { id: transaction.id, description: entryName('origin', first) },
      );
    },
  );
  useBusy(create.isPending, onBusyChange);
  const currency = open.find((a) => a.id === accountId)?.currency ?? 'USD';

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = toLoanBody(
      direction,
      accountId,
      { person, amount, dueOn },
      currency,
      locale,
      note,
    );
    const date = parseEntryDate(occurredOn);
    setError(result.ok ? undefined : result.errors[0]);
    setDateError(date.ok ? undefined : date.error);
    if (!result.ok || !date.ok) return;
    create.mutate({ ...result.body, occurredOn: date.date });
  }

  return (
    <form className="mt-4 grid gap-4" noValidate onSubmit={submit}>
      <FieldControl label={t('budget.ious.direction')}>
        {(props) => (
          <select
            {...props}
            name="direction"
            value={direction}
            className={selectClass}
            onChange={(e) => {
              setDirection(
                e.currentTarget.value === 'owed-by-me'
                  ? 'owed-by-me'
                  : 'owed-to-me',
              );
            }}
          >
            <option value="owed-to-me">{t('budget.ious.lend')}</option>
            <option value="owed-by-me">{t('budget.ious.borrow')}</option>
          </select>
        )}
      </FieldControl>
      <AccountSelect
        accounts={accounts}
        value={accountId}
        onChange={setAccountId}
        label={
          direction === 'owed-to-me'
            ? t('budget.ious.paidFrom')
            : t('budget.ious.receivedIn')
        }
      />
      <PeopleInput
        label={t('budget.ious.person')}
        name="person"
        value={person}
        error={error === 'person' ? t('budget.ious.errors.person') : undefined}
        onChange={setPerson}
      />
      <MoneyInput
        label={t('budget.ious.amount')}
        name="amount"
        value={amount}
        currency={currency}
        locale={locale}
        error={error === 'amount' ? 'invalid' : undefined}
        onChange={setAmount}
      />
      <EntryDate
        value={occurredOn}
        onChange={setOccurredOn}
        error={dateError}
        locale={locale}
      />
      <FieldControl
        label={t('budget.ious.dueOn')}
        hint={t('budget.ious.dueHint')}
      >
        {(props) => (
          <Input
            {...props}
            type="date"
            name="dueOn"
            value={dueOn}
            onChange={(e) => {
              setDueOn(e.currentTarget.value);
            }}
          />
        )}
      </FieldControl>
      <FieldControl label={t('budget.ious.note')}>
        {(props) => (
          <Input
            {...props}
            name="note"
            value={note}
            maxLength={500}
            autoComplete="off"
            onChange={(e) => {
              setNote(e.currentTarget.value);
            }}
          />
        )}
      </FieldControl>
      <FormError
        message={create.isError ? describeProblem(create.error).message : null}
      />
      <Button type="submit" disabled={create.isPending}>
        {t('budget.ious.record')}
      </Button>
    </form>
  );
}

/** The person's open IOUs the same way and in the same currency, oldest first. */
function openWith(list: readonly IouView[], iou: IouView): IouView[] {
  const person = iou.person.toLowerCase();
  return list
    .filter(
      (other) =>
        !other.settled &&
        other.person.toLowerCase() === person &&
        other.direction === iou.direction &&
        other.outstanding.currency === iou.outstanding.currency,
    )
    .sort(
      (a, b) =>
        a.recordedOn.localeCompare(b.recordedOn) || a.id.localeCompare(b.id),
    );
}

function RepayForm({
  iou,
  siblings,
  accounts,
  locale,
  today,
  onDone,
  onBusyChange,
}: Omit<FormProps, 'categories'> & {
  iou: IouView;
  siblings: readonly IouView[];
}) {
  const currency = iou.outstanding.currency;
  const options = accounts.filter(
    (a) => !a.archived && a.currency === currency,
  );
  // With several open IOUs the payment goes to the person: the server settles
  // the oldest first and the surplus moves on to the next.
  const byPerson = siblings.length > 1;
  const owed = money(
    siblings.reduce((sum, s) => sum + s.outstanding.amountMinor, 0),
    currency,
  );
  const stillOwed = byPerson ? owed : iou.outstanding;
  const newest = siblings.reduce(
    (latest, s) => (s.recordedOn > latest ? s.recordedOn : latest),
    iou.recordedOn,
  );
  const [accountId, setAccountId] = useState(options[0]?.id ?? '');
  const [amount, setAmount] = useState(formatMoneyInput(stillOwed, locale));
  const [error, setError] = useState<AmountError>();
  const [occurredOn, setOccurredOn] = useState<string>(today);
  const [dateError, setDateError] = useState<DateError>();
  const repay = useIouChange(repayIous, ({ transaction }) => {
    onDone({
      id: transaction.id,
      description: entryName('repayment', iou),
    });
  });
  useBusy(repay.isPending, onBusyChange);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseBillAmount(amount, currency, locale);
    const date = parseEntryDate(occurredOn, byPerson ? newest : iou.recordedOn);
    setError(parsed.ok ? undefined : parsed.error);
    setDateError(date.ok ? undefined : date.error);
    if (!parsed.ok || !date.ok) return;
    repay.mutate(
      byPerson
        ? {
            accountId,
            person: iou.person,
            amount: parsed.amount,
            direction: iou.direction,
            occurredOn: date.date,
          }
        : {
            accountId,
            settles: [{ iouId: iou.id, amount: parsed.amount }],
            direction: iou.direction,
            occurredOn: date.date,
          },
    );
  }

  return (
    <form className="mt-4 grid gap-4" noValidate onSubmit={submit}>
      <AccountSelect
        accounts={accounts}
        currency={currency}
        value={accountId}
        onChange={setAccountId}
        label={
          iou.direction === 'owed-to-me'
            ? t('budget.ious.arrivedIn')
            : t('budget.ious.paidFrom')
        }
      />
      <MoneyInput
        label={t('budget.ious.repayAmount')}
        name="amount"
        value={amount}
        currency={currency}
        locale={locale}
        error={error}
        hint={
          byPerson
            ? t('budget.ious.stillOwedAcross', {
                amount: formatMoney(stillOwed, locale),
                count: siblings.length,
              })
            : t('budget.ious.stillOwed', {
                amount: formatMoney(stillOwed, locale),
              })
        }
        onChange={setAmount}
      />
      <EntryDate
        value={occurredOn}
        onChange={setOccurredOn}
        error={dateError}
        notBefore={byPerson ? newest : iou.recordedOn}
        locale={locale}
      />
      <FormError
        message={repay.isError ? describeProblem(repay.error).message : null}
      />
      <Button type="submit" disabled={repay.isPending || accountId === ''}>
        {t('budget.ious.recordRepayment')}
      </Button>
    </form>
  );
}

function WriteOffForm({
  iou,
  categories,
  locale,
  today,
  onDone,
  onBusyChange,
}: Omit<FormProps, 'accounts'> & { iou: IouView }) {
  const options = categoryOptions(categories, 'expense');
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? '');
  const [occurredOn, setOccurredOn] = useState<string>(today);
  const [dateError, setDateError] = useState<DateError>();
  const off = useIouChange(
    (date: LocalDate) => writeOffIou(iou.id, { categoryId, occurredOn: date }),
    ({ transaction }) => {
      onDone({
        id: transaction.id,
        description: entryName('write-off', iou),
      });
    },
  );
  useBusy(off.isPending, onBusyChange);
  return (
    <form
      className="mt-4 grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const date = parseEntryDate(occurredOn, iou.recordedOn);
        setDateError(date.ok ? undefined : date.error);
        if (date.ok) off.mutate(date.date);
      }}
    >
      <p className="text-body">
        {t('budget.ious.writeOffBody', {
          amount: formatMoney(iou.outstanding, locale),
          person: iou.person,
        })}
      </p>
      <p className="text-body text-text-muted">
        {iou.writeOffOffered || iou.writeOffOfferedOn === null
          ? t('budget.ious.writeOffOffered')
          : t('budget.ious.writeOffAnyTime', {
              date: formatLongDay(iou.writeOffOfferedOn, locale),
            })}
      </p>
      <FieldControl label={t('budget.ious.writeOffCategory')}>
        {(props) => (
          <select
            {...props}
            name="categoryId"
            value={categoryId}
            className={selectClass}
            onChange={(e) => {
              setCategoryId(e.currentTarget.value);
            }}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </FieldControl>
      <EntryDate
        value={occurredOn}
        onChange={setOccurredOn}
        error={dateError}
        notBefore={iou.recordedOn}
        locale={locale}
      />
      <FormError
        message={off.isError ? describeProblem(off.error).message : null}
      />
      <Button type="submit" disabled={off.isPending || categoryId === ''}>
        {t('budget.ious.writeOff')}
      </Button>
    </form>
  );
}

function EditForm({
  iou,
  onDone,
  onBusyChange,
}: Pick<FormProps, 'onDone' | 'onBusyChange'> & { iou: IouView }) {
  const [person, setPerson] = useState(iou.person);
  const [dueOn, setDueOn] = useState(iou.dueOn ?? '');
  const save = useIouChange(
    (body: Parameters<typeof updateIou>[1]) => updateIou(iou.id, body),
    () => {
      onDone();
    },
  );
  useBusy(save.isPending, onBusyChange);
  return (
    <form
      className="mt-4 grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          person: person.trim(),
          dueOn: isLocalDate(dueOn) ? localDate(dueOn) : null,
        });
      }}
    >
      <PeopleInput
        label={t('budget.ious.person')}
        name="person"
        value={person}
        onChange={setPerson}
      />
      <FieldControl
        label={t('budget.ious.dueOn')}
        hint={t('budget.ious.dueHint')}
      >
        {(props) => (
          <Input
            {...props}
            type="date"
            name="dueOn"
            value={dueOn}
            onChange={(e) => {
              setDueOn(e.currentTarget.value);
            }}
          />
        )}
      </FieldControl>
      <FormError
        message={save.isError ? describeProblem(save.error).message : null}
      />
      <Button type="submit" disabled={save.isPending || person.trim() === ''}>
        {t('budget.budgets.save')}
      </Button>
    </form>
  );
}

/** The IOU's own entry goes, with everyone else it recorded. */
function DeleteForm({
  shared,
  onDelete,
}: {
  /** Other IOUs recorded by the same entry. */
  shared: readonly IouView[];
  onDelete: (onError: (message: string) => void) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mt-4 grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setPending(true);
        onDelete((message) => {
          setPending(false);
          setError(message);
        });
      }}
    >
      <p className="text-body">{t('budget.ious.deleteBody')}</p>
      {shared.length > 0 ? (
        <p className="text-body text-text-muted">
          {t('budget.ious.deleteShared', {
            names: shared.map((other) => other.person).join(', '),
          })}
        </p>
      ) : null}
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {t('budget.ious.deleteSubmit')}
      </Button>
    </form>
  );
}

function settlementLabel(settlement: IouSettlementView, iou: IouView): string {
  return settlement.kind === 'write-off'
    ? t('budget.ious.kinds.writtenOff')
    : iou.direction === 'owed-to-me'
      ? t('budget.ious.kinds.repaid')
      : t('budget.ious.kinds.paidBack');
}

/** Each live repayment or write-off, as an entry that can be deleted. */
function Payments({
  iou,
  locale,
  onDelete,
}: {
  iou: IouView;
  locale: string;
  onDelete: (id: string, description: string) => void;
}) {
  const live = iou.settlements.filter((s) => !s.undone);
  if (live.length === 0) return null;
  return (
    <ul
      aria-label={t('budget.ious.paymentsFor', { person: iou.person })}
      data-testid="iou-payments"
      className="grid gap-1"
    >
      {live.map((settlement) => {
        const label = settlementLabel(settlement, iou);
        const amount = formatMoney(settlement.amount, locale);
        const date = formatLongDay(settlement.on, locale);
        return (
          <li
            key={settlement.id}
            className="flex items-center justify-between gap-3 text-caption text-text-muted"
          >
            <span>
              {date} · {label}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono">{amount}</span>
              <Button
                variant="text"
                size="dense"
                aria-label={t('budget.ious.deletePayment', {
                  kind: label.toLowerCase(),
                  amount,
                  date,
                })}
                onClick={() => {
                  onDelete(
                    settlement.transactionId,
                    entryName(settlement.kind, iou),
                  );
                }}
              >
                {t('budget.ious.delete')}
              </Button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function IouRow({
  iou,
  locale,
  onOpen,
  onDeletePayment,
}: {
  iou: IouView;
  locale: string;
  onOpen: (open: Exclude<Open, null | { kind: 'loan' }>) => void;
  onDeletePayment: (id: string, description: string) => void;
}) {
  const toMe = iou.direction === 'owed-to-me';
  return (
    <li
      data-testid="iou-row"
      className="grid gap-1 border-b border-outline-variant py-3 last:border-b-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-body font-medium wrap-anywhere">{iou.person}</h4>
          <p className="text-caption text-text-muted">
            {toMe ? t('budget.ious.owesYou') : t('budget.ious.youOwe')}
            {iou.dueOn === null
              ? ''
              : ` · ${t('budget.ious.due', { date: formatLongDay(iou.dueOn, locale) })}`}
          </p>
        </div>
        <p className="font-mono text-body">
          {formatMoney(iou.outstanding, locale)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {iou.settled ? (
          <StatusChip tone="success" icon={<CircleCheck aria-hidden="true" />}>
            {t('budget.ious.settled')}
          </StatusChip>
        ) : null}
        {iou.overdue ? (
          <StatusChip
            tone="warning"
            icon={<TriangleAlert aria-hidden="true" />}
          >
            {t('budget.ious.overdue', { count: iou.daysOverdue })}
          </StatusChip>
        ) : null}
        {toMe && iou.writeOffOffered ? (
          <StatusChip tone="info" icon={<HandCoins aria-hidden="true" />}>
            {t('budget.ious.writeOffOnOffer')}
          </StatusChip>
        ) : null}
      </div>
      <Payments iou={iou} locale={locale} onDelete={onDeletePayment} />
      <div className="flex flex-wrap gap-2">
        {iou.settled ? null : (
          <Button
            variant="outlined"
            size="dense"
            onClick={() => {
              onOpen({ kind: 'repay', iou });
            }}
          >
            {toMe ? t('budget.ious.recordRepayment') : t('budget.ious.payBack')}
            <span className="sr-only"> {iou.person}</span>
          </Button>
        )}
        {toMe && !iou.settled ? (
          <Button
            variant="text"
            size="dense"
            onClick={() => {
              onOpen({ kind: 'writeoff', iou });
            }}
          >
            {t('budget.ious.writeOff')}
            <span className="sr-only"> {iou.person}</span>
          </Button>
        ) : null}
        <Button
          variant="text"
          size="dense"
          onClick={() => {
            onOpen({ kind: 'edit', iou });
          }}
        >
          {t('budget.edit')}
          <span className="sr-only"> {iou.person}</span>
        </Button>
        <Button
          variant="text"
          size="dense"
          onClick={() => {
            onOpen({ kind: 'delete', iou });
          }}
        >
          {t('budget.ious.delete')}
          <span className="sr-only"> {iou.person}</span>
        </Button>
      </div>
    </li>
  );
}

/** Money lent and borrowed: who owes whom, repayments and write-offs. */
export function IousSection({
  list: open_,
  accounts,
  categories,
  currency,
  locale,
  today,
}: {
  list: IouListView;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  currency: CurrencyCode;
  locale: string;
  today: LocalDate;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const all = useQuery({ ...allIousQuery, enabled: showSettled });
  const list = showSettled && all.data !== undefined ? all.data : open_;
  const snack = useSnackbar();
  const close = () => {
    setOpen(null);
  };
  const removeEntry = useDeleteEntry();
  const removeIou = useDeleteEntry(close);
  const deleteEntry = (id: string, description: string) => {
    removeEntry.mutate(
      { id, description },
      {
        onError: (error) => {
          snack({ message: errorMessage(error), tone: 'error' });
        },
      },
    );
  };
  // Saved from a sheet: say so, with Undo, which deletes it again.
  const done = (saved?: Saved) => {
    close();
    if (saved === undefined) return;
    snack({
      message: t('budget.ious.recorded', { entry: saved.description }),
      action: {
        label: t('entries.restore'),
        onAction: () => {
          deleteEntry(saved.id, saved.description);
        },
      },
    });
  };
  const title =
    open === null
      ? ''
      : open.kind === 'loan'
        ? t('budget.ious.addTitle')
        : t(`budget.ious.titles.${open.kind}`, { person: open.iou.person });
  const shared = {
    accounts,
    locale,
    today,
    onDone: done,
    onBusyChange: setBusy,
  };
  return (
    <Section
      id="ious"
      title={t('budget.ious.title')}
      intro={t('budget.ious.intro')}
    >
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-body" data-testid="iou-totals">
          {t('budget.ious.totals', {
            toMe: formatMoney(list.totals.owedToMe, locale),
            byMe: formatMoney(list.totals.owedByMe, locale),
          })}
        </p>
        <Button
          variant="tonal"
          size="dense"
          onClick={() => {
            setOpen({ kind: 'loan' });
          }}
        >
          {t('budget.ious.add')}
        </Button>
        <label className="flex items-center gap-2 text-body">
          <input
            type="checkbox"
            checked={showSettled}
            onChange={(e) => {
              setShowSettled(e.currentTarget.checked);
            }}
          />
          {t('budget.ious.showSettled')}
        </label>
      </div>
      {list.totals.missingRates.length > 0 ? (
        <p className="mt-1 text-caption text-text-muted">
          {t('budget.ious.missingRates', {
            currencies: list.totals.missingRates.join(', '),
            currency,
          })}
        </p>
      ) : null}
      {list.ious.length === 0 ? (
        <p className="mt-4 text-body text-text-muted">
          {t('budget.ious.empty')}
        </p>
      ) : (
        <ul className="mt-3 border-y border-outline-variant">
          {list.ious.map((iou) => (
            <IouRow
              key={iou.id}
              iou={iou}
              locale={locale}
              onOpen={setOpen}
              onDeletePayment={deleteEntry}
            />
          ))}
        </ul>
      )}
      <Sheet
        open={open !== null}
        title={title}
        busy={busy || removeIou.isPending}
        onClose={close}
      >
        {open === null ? null : open.kind === 'loan' ? (
          <LoanForm {...shared} />
        ) : open.kind === 'repay' ? (
          <RepayForm
            key={open.iou.id}
            iou={open.iou}
            siblings={openWith(list.ious, open.iou)}
            {...shared}
          />
        ) : open.kind === 'writeoff' ? (
          <WriteOffForm
            key={open.iou.id}
            iou={open.iou}
            categories={categories}
            locale={locale}
            today={today}
            onDone={done}
            onBusyChange={setBusy}
          />
        ) : open.kind === 'delete' ? (
          <DeleteForm
            key={open.iou.id}
            shared={list.ious.filter(
              (other) =>
                other.originId === open.iou.originId &&
                other.id !== open.iou.id,
            )}
            onDelete={(onError) => {
              removeIou.mutate(
                {
                  id: open.iou.originId,
                  description: entryName('origin', open.iou),
                },
                {
                  onError: (error) => {
                    onError(
                      error instanceof ApiError &&
                        error.problem.code === 'iou_has_payments'
                        ? t('budget.ious.hasPayments')
                        : errorMessage(error),
                    );
                  },
                },
              );
            }}
          />
        ) : (
          <EditForm
            key={open.iou.id}
            iou={open.iou}
            onDone={done}
            onBusyChange={setBusy}
          />
        )}
      </Sheet>
    </Section>
  );
}
