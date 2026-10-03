import {
  formatMoney,
  formatMoneyInput,
  isLocalDate,
  localDate,
  type AccountView,
  type CategoryView,
  type CurrencyCode,
  type IouListView,
  type IouView,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HandCoins, TriangleAlert } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusChip } from '@/components/ui/status-chip';
import { Sheet } from '@/features/accounts/sheet';
import { MoneyInput } from '@/features/budget/money-input';
import { formatLongDay } from '@/features/ledger/format';
import { categoryOptions } from '@/features/quick-entry/options';
import {
  parseBillAmount,
  type AmountError,
} from '@/features/settings/bill-draft';
import { Section } from '@/features/settings/section';
import { useBusy } from '@/features/settings/use-busy';
import {
  createIou,
  iouQueryKeys,
  repayIous,
  updateIou,
  writeOffIou,
} from '@/lib/ious';
import { describeProblem } from '@/lib/problem';
import { randomId } from '@/lib/random-id';
import { invalidate } from '@/lib/settings';
import { t } from '@/messages/t';
import { toLoanBody, type PersonError } from './draft.ts';
import { PeopleInput } from './people-input.tsx';

type Open =
  | { kind: 'loan' }
  | { kind: 'repay' | 'writeoff' | 'edit'; iou: IouView }
  | null;

interface FormProps {
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  locale: string;
  onDone: () => void;
  onBusyChange: (busy: boolean) => void;
}

function useIouChange<A, R>(run: (args: A) => Promise<R>, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await invalidate(queryClient, iouQueryKeys);
      onDone();
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
  const [error, setError] = useState<PersonError>();
  const [key] = useState(() => randomId());
  const create = useIouChange(
    (body: Parameters<typeof createIou>[0]) => createIou(body, key),
    onDone,
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
    if (!result.ok) {
      setError(result.errors[0]);
      return;
    }
    setError(undefined);
    create.mutate(result.body);
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

function RepayForm({
  iou,
  accounts,
  locale,
  onDone,
  onBusyChange,
}: Omit<FormProps, 'categories'> & { iou: IouView }) {
  const currency = iou.outstanding.currency;
  const options = accounts.filter(
    (a) => !a.archived && a.currency === currency,
  );
  const [accountId, setAccountId] = useState(options[0]?.id ?? '');
  const [amount, setAmount] = useState(
    formatMoneyInput(iou.outstanding, locale),
  );
  const [error, setError] = useState<AmountError>();
  const repay = useIouChange(repayIous, onDone);
  useBusy(repay.isPending, onBusyChange);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseBillAmount(amount, currency, locale);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(undefined);
    repay.mutate({
      accountId,
      settles: [{ iouId: iou.id, amount: parsed.amount }],
      direction: iou.direction,
    });
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
        hint={t('budget.ious.stillOwed', {
          amount: formatMoney(iou.outstanding, locale),
        })}
        onChange={setAmount}
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
  onDone,
  onBusyChange,
}: Omit<FormProps, 'accounts'> & { iou: IouView }) {
  const options = categoryOptions(categories, 'expense');
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? '');
  const off = useIouChange(
    (id: string) => writeOffIou(id, { categoryId }),
    onDone,
  );
  useBusy(off.isPending, onBusyChange);
  return (
    <form
      className="mt-4 grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        off.mutate(iou.id);
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
    onDone,
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

function IouRow({
  iou,
  locale,
  onOpen,
}: {
  iou: IouView;
  locale: string;
  onOpen: (open: Exclude<Open, null | { kind: 'loan' }>) => void;
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
      <div className="flex flex-wrap gap-2">
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
        {toMe ? (
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
      </div>
    </li>
  );
}

/** Money lent and borrowed: who owes whom, repayments and write-offs. */
export function IousSection({
  list,
  accounts,
  categories,
  currency,
  locale,
}: {
  list: IouListView;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  currency: CurrencyCode;
  locale: string;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setOpen(null);
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
    onDone: close,
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
            <IouRow key={iou.id} iou={iou} locale={locale} onOpen={setOpen} />
          ))}
        </ul>
      )}
      <Sheet open={open !== null} title={title} busy={busy} onClose={close}>
        {open === null ? null : open.kind === 'loan' ? (
          <LoanForm {...shared} />
        ) : open.kind === 'repay' ? (
          <RepayForm key={open.iou.id} iou={open.iou} {...shared} />
        ) : open.kind === 'writeoff' ? (
          <WriteOffForm
            key={open.iou.id}
            iou={open.iou}
            categories={categories}
            locale={locale}
            onDone={close}
            onBusyChange={setBusy}
          />
        ) : (
          <EditForm
            key={open.iou.id}
            iou={open.iou}
            onDone={close}
            onBusyChange={setBusy}
          />
        )}
      </Sheet>
    </Section>
  );
}
