import {
  formatMoney,
  formatMoneyInput,
  type AccountView,
  type BillView,
  type Money,
  type TodayView,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/features/accounts/sheet';
import { formatLongDay } from '@/features/ledger/format';
import { amountExample } from '@/features/quick-entry/draft';
import { describeProblem, errorMessage } from '@/lib/problem';
import {
  billQueryKeys,
  createBill,
  deleteBill,
  invalidate,
  payBill,
  unpayBill,
  updateBill,
} from '@/lib/settings';
import { t } from '@/messages/t';
import {
  dueThisCycle,
  parseBillAmount,
  type AmountError,
  type CycleBill,
} from './bill-draft.ts';
import { Section } from './section.tsx';
import { useBusy } from './use-busy.ts';

type Open =
  { kind: 'create' } | { kind: 'edit' | 'delete'; bill: BillView } | null;

const dueDays = Array.from({ length: 31 }, (_, i) => i + 1);

function useBillChange<A, R>(run: (args: A) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await invalidate(queryClient, billQueryKeys);
    },
  });
}

function amountErrorText(
  error: AmountError | undefined,
  currency: string,
  locale: string,
): string | undefined {
  switch (error) {
    case undefined:
      return undefined;
    case 'required':
      return t('settings.bills.errors.amountRequired');
    case 'decimals':
      return t('settings.bills.errors.amountDecimals');
    case 'positive':
      return t('settings.bills.errors.amountPositive');
    case 'invalid':
      return t('settings.bills.errors.amountInvalid', {
        example: amountExample(currency, locale),
      });
  }
}

function DueDaySelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (day: number) => void;
}) {
  return (
    <FieldControl
      label={t('settings.bills.dueDay')}
      hint={t('settings.payday.dayHint')}
    >
      {(props) => (
        <select
          {...props}
          name="dueDay"
          value={value}
          className={selectClass}
          onChange={(e) => {
            onChange(Number(e.currentTarget.value));
          }}
        >
          {dueDays.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      )}
    </FieldControl>
  );
}

export function BillForm({
  bill,
  accounts,
  locale,
  onDone,
  onCancel,
  onBusyChange,
}: {
  bill: BillView | undefined;
  accounts: readonly AccountView[];
  locale: string;
  onDone: (name: string) => void;
  /** Leave it out where there is nothing to cancel back to. */
  onCancel?: (() => void) | undefined;
  onBusyChange: (busy: boolean) => void;
}) {
  const open = accounts.filter((a) => !a.archived);
  const [name, setName] = useState(bill?.name ?? '');
  const [accountId, setAccountId] = useState(
    bill?.accountId ?? open.find((a) => a.budgetGroup === 'on')?.id ?? '',
  );
  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? bill?.amount.currency ?? '';
  const [amount, setAmount] = useState(
    bill === undefined ? '' : formatMoneyInput(bill.amount, locale),
  );
  const [dueDay, setDueDay] = useState(bill?.dueDay ?? 1);
  const [active, setActive] = useState(bill?.active ?? true);
  const [amountError, setAmountError] = useState<AmountError>();
  const [accountMissing, setAccountMissing] = useState(false);
  const activeId = useId();
  const save = useBillChange((parsed: Money) =>
    bill === undefined
      ? createBill({ name: name.trim(), accountId, amount: parsed, dueDay })
      : updateBill(bill.id, {
          name: name.trim(),
          amount: parsed,
          dueDay,
          active,
        }),
  );
  useBusy(save.isPending, onBusyChange);
  const problem = save.isError ? describeProblem(save.error) : null;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = accountId === '' || currency === '';
    const parsed = missing ? null : parseBillAmount(amount, currency, locale);
    setAccountMissing(missing);
    setAmountError(parsed !== null && !parsed.ok ? parsed.error : undefined);
    if (missing || parsed === null || !parsed.ok) {
      const field = event.currentTarget.elements.namedItem(
        missing ? 'accountId' : 'amount',
      );
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    save.mutate(parsed.amount, {
      onSuccess: (saved) => {
        onDone(saved.name);
      },
    });
  }

  return (
    <form className="mt-6 grid gap-5" onSubmit={submit} noValidate>
      <FieldControl
        label={t('settings.bills.name')}
        error={problem?.fields.name}
      >
        {(props) => (
          <Input
            {...props}
            name="name"
            value={name}
            maxLength={100}
            required
            autoComplete="off"
            className="h-11 text-base"
            onChange={(e) => {
              setName(e.currentTarget.value);
              if (save.isError) save.reset();
            }}
          />
        )}
      </FieldControl>
      {bill === undefined ? (
        <FieldControl
          label={t('settings.bills.account')}
          error={
            accountMissing
              ? t('settings.bills.errors.accountRequired')
              : undefined
          }
        >
          {(props) => (
            <select
              {...props}
              name="accountId"
              value={accountId}
              className={selectClass}
              onChange={(e) => {
                setAccountId(e.currentTarget.value);
                setAccountMissing(false);
              }}
            >
              <option value="">{t('settings.bills.chooseAccount')}</option>
              {open.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          )}
        </FieldControl>
      ) : (
        <p className="text-sm text-text-muted">
          {t('settings.bills.paidFrom', { account: account?.name ?? '' })}
        </p>
      )}
      <FieldControl
        label={
          currency === ''
            ? t('settings.bills.amount')
            : t('settings.bills.amountIn', { currency })
        }
        error={amountErrorText(amountError, currency, locale)}
      >
        {(props) => (
          <Input
            {...props}
            name="amount"
            value={amount}
            inputMode="decimal"
            autoComplete="off"
            className="h-11 text-base"
            onChange={(e) => {
              setAmount(e.currentTarget.value);
              setAmountError(undefined);
            }}
          />
        )}
      </FieldControl>
      <DueDaySelect value={dueDay} onChange={setDueDay} />
      {bill === undefined ? null : (
        <div className="flex items-start gap-3">
          <input
            id={activeId}
            type="checkbox"
            name="active"
            checked={active}
            aria-describedby={`${activeId}-hint`}
            onChange={(e) => {
              setActive(e.currentTarget.checked);
            }}
            className="mt-1 size-4 accent-primary"
          />
          <div>
            <label htmlFor={activeId} className="font-medium">
              {t('settings.bills.active')}
            </label>
            <p id={`${activeId}-hint`} className="text-sm text-text-muted">
              {t('settings.bills.activeHint')}
            </p>
          </div>
        </div>
      )}
      <FormError message={problem?.message ?? null} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11" disabled={save.isPending}>
          {save.isPending
            ? t('settings.saving')
            : bill === undefined
              ? t('settings.bills.addSubmit')
              : t('settings.save')}
        </Button>
        {onCancel === undefined ? null : (
          <Button
            type="button"
            variant="outlined"
            className="h-11"
            disabled={save.isPending}
            onClick={onCancel}
          >
            {t('settings.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

function DeleteBill({
  bill,
  onDone,
  onCancel,
  onBusyChange,
}: {
  bill: BillView;
  onDone: () => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const remove = useBillChange(() => deleteBill(bill.id));
  useBusy(remove.isPending, onBusyChange);
  return (
    <div className="mt-4 grid gap-5">
      <p>{t('settings.bills.deleteIntro')}</p>
      <FormError message={remove.isError ? errorMessage(remove.error) : null} />
      <div className="flex flex-wrap gap-3">
        <Button
          className="h-11"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(undefined, { onSuccess: onDone });
          }}
        >
          {remove.isPending ? t('settings.saving') : t('settings.delete')}
        </Button>
        <Button
          variant="outlined"
          className="h-11"
          disabled={remove.isPending}
          onClick={onCancel}
        >
          {t('settings.cancel')}
        </Button>
      </div>
    </div>
  );
}

function DueLine({
  bill,
  due,
  locale,
  onAnnounce,
}: {
  bill: BillView;
  due: CycleBill;
  locale: string;
  onAnnounce: (message: string) => void;
}) {
  const mark = useBillChange((paid: boolean) =>
    paid ? unpayBill(bill.id, due.dueOn) : payBill(bill.id, due.dueOn),
  );
  const day = formatLongDay(due.dueOn, locale);
  const paid = due.paidOn !== null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-sm">
        {paid
          ? t('settings.bills.paidOn', {
              day,
              paidOn: formatLongDay(due.paidOn ?? due.dueOn, locale),
            })
          : t('settings.bills.reserved', { day })}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {mark.isError ? (
          <span role="alert" className="text-sm font-medium text-negative">
            {errorMessage(mark.error)}
          </span>
        ) : null}
        <Button
          variant="outlined"
          size="dense"
          disabled={mark.isPending}
          onClick={() => {
            mark.mutate(paid, {
              onSuccess: () => {
                onAnnounce(
                  paid
                    ? t('settings.bills.announce.unpaid', {
                        name: bill.name,
                        day,
                      })
                    : t('settings.bills.announce.paid', {
                        name: bill.name,
                        day,
                      }),
                );
              },
            });
          }}
        >
          {paid ? t('settings.bills.undoPaid') : t('settings.bills.markPaid')}
          <span className="sr-only">
            {' '}
            {t('settings.bills.dueOn', { name: bill.name, day })}
          </span>
        </Button>
      </span>
    </li>
  );
}

function BillItem({
  bill,
  account,
  cycleBills,
  locale,
  onOpen,
  onAnnounce,
}: {
  bill: BillView;
  account: AccountView | undefined;
  cycleBills: readonly CycleBill[];
  locale: string;
  onOpen: (open: Open) => void;
  onAnnounce: (message: string) => void;
}) {
  const nameId = useId();
  const due = dueThisCycle(bill.id, cycleBills);
  return (
    <li
      aria-labelledby={nameId}
      data-bill-id={bill.id}
      className="grid gap-3 rounded-md bg-card p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 wrap-anywhere">
          <span id={nameId} className="font-medium">
            {bill.name}
          </span>{' '}
          <span className="text-sm text-text-muted">
            {t('settings.bills.summary', {
              day: bill.dueDay,
              account: account?.name ?? '',
            })}
            {bill.active ? '' : ` · ${t('settings.bills.inactive')}`}
          </span>
        </p>
        <p className="font-mono text-lg tabular-nums wrap-anywhere">
          {formatMoney(bill.amount, locale)}
        </p>
      </div>
      {bill.active ? (
        due.length === 0 ? (
          <p className="text-sm text-text-muted">
            {t('settings.bills.notThisCycle')}
          </p>
        ) : (
          <ul className="grid gap-2">
            {due.map((d) => (
              <DueLine
                key={d.dueOn}
                bill={bill}
                due={d}
                locale={locale}
                onAnnounce={onAnnounce}
              />
            ))}
          </ul>
        )
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          size="dense"
          data-action="edit"
          onClick={() => {
            onOpen({ kind: 'edit', bill });
          }}
        >
          {t('settings.edit')}
          <span className="sr-only"> {bill.name}</span>
        </Button>
        <Button
          variant="outlined"
          size="dense"
          onClick={() => {
            onOpen({ kind: 'delete', bill });
          }}
        >
          {t('settings.delete')}
          <span className="sr-only"> {bill.name}</span>
        </Button>
      </div>
    </li>
  );
}

// Bills, only as far as the reserve needs them (docs/domain.md "Daily
// usable"): each due date in the cycle is set aside until it is marked paid.
export function BillsSection({
  bills,
  accounts,
  today,
  locale,
}: {
  bills: readonly BillView[];
  accounts: readonly AccountView[];
  today: TodayView;
  locale: string;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const close = () => {
    setOpen(null);
  };
  const opening = (next: Open) => {
    setAnnouncement('');
    setOpen(next);
  };
  const title =
    open === null
      ? ''
      : open.kind === 'create'
        ? t('settings.bills.addTitle')
        : open.kind === 'edit'
          ? t('settings.bills.editTitle', { name: open.bill.name })
          : t('settings.bills.deleteTitle', { name: open.bill.name });
  const hasAccounts = accounts.some((a) => !a.archived);

  return (
    <Section
      id="bills"
      title={t('settings.bills.title')}
      intro={t('settings.bills.intro')}
    >
      <Button
        className="mt-4"
        disabled={!hasAccounts}
        aria-describedby={hasAccounts ? undefined : 'bills-no-accounts'}
        onClick={() => {
          opening({ kind: 'create' });
        }}
      >
        <Plus aria-hidden />
        {t('settings.bills.add')}
      </Button>
      {hasAccounts ? null : (
        <p id="bills-no-accounts" className="mt-2 text-sm text-text-muted">
          {t('settings.bills.noAccounts')}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {bills.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">
          {t('settings.bills.none')}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {bills.map((bill) => (
            <BillItem
              key={bill.id}
              bill={bill}
              account={accounts.find((a) => a.id === bill.accountId)}
              cycleBills={today.cycleBills}
              locale={locale}
              onOpen={opening}
              onAnnounce={setAnnouncement}
            />
          ))}
        </ul>
      )}
      <Sheet
        open={open !== null}
        title={title}
        busy={busy}
        onClose={close}
        fallback={() => document.getElementById('bills-title')}
      >
        {open === null ? null : open.kind === 'delete' ? (
          <DeleteBill
            bill={open.bill}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={() => {
              const { name } = open.bill;
              close();
              setAnnouncement(t('settings.bills.announce.deleted', { name }));
            }}
          />
        ) : (
          <BillForm
            bill={open.kind === 'edit' ? open.bill : undefined}
            accounts={accounts}
            locale={locale}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={(name) => {
              close();
              setAnnouncement(
                open.kind === 'edit'
                  ? t('settings.saved')
                  : t('settings.bills.announce.added', { name }),
              );
            }}
          />
        )}
      </Sheet>
    </Section>
  );
}
