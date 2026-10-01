import {
  addDays,
  formatMoney,
  formatMoneyInput,
  localDate,
  type AccountView,
  type BillView,
  type CategoryView,
  type CreateBillPaymentBody,
  type ExchangeRateView,
  type LocalDate,
  type Money,
  type TodayView,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/features/accounts/sheet';
import { formatLongDay } from '@/features/ledger/format';
import { amountExample } from '@/features/quick-entry/draft';
import { categoryOptions } from '@/features/quick-entry/options';
import { useCurrencyOptions } from '@/lib/currency-options';
import { accountEntriesQuery } from '@/lib/ledger';
import { describeProblem, errorMessage } from '@/lib/problem';
import {
  billPaymentQueryKeys,
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
  lastPricedPayment,
  linkCandidates,
  paidUnit,
  parseBillAmount,
  storedUnit,
  type AmountError,
  type CycleBill,
} from './bill-draft.ts';
import { Section } from './section.tsx';
import { useBusy } from './use-busy.ts';

type PayHow = 'record' | 'link';

// How far before a due date an entry can be that paid it.
const LINK_DAYS_BEFORE = 31;

type Open =
  | { kind: 'create' }
  | { kind: 'edit' | 'delete'; bill: BillView }
  | { kind: 'pay'; bill: BillView; due: CycleBill }
  | null;

const dueDays = Array.from({ length: 31 }, (_, i) => i + 1);

function useBillChange<A, R>(
  run: (args: A) => Promise<R>,
  keys: typeof billQueryKeys | typeof billPaymentQueryKeys = billQueryKeys,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await invalidate(queryClient, keys);
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

function CategorySelect({
  categories,
  value,
  onChange,
  label,
  hint,
  error,
}: {
  categories: readonly CategoryView[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}) {
  const options = categoryOptions(categories, 'expense');
  return (
    <FieldControl label={label} hint={hint} error={error}>
      {(props) => (
        <select
          {...props}
          name="categoryId"
          value={value}
          className={selectClass}
          onChange={(e) => {
            onChange(e.currentTarget.value);
          }}
        >
          <option value="">{t('settings.bills.noCategory')}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
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
  categories,
  locale,
  onDone,
  onCancel,
  onBusyChange,
}: {
  bill: BillView | undefined;
  accounts: readonly AccountView[];
  /** Leave it out to not ask for a category, as during setup. */
  categories?: readonly CategoryView[] | undefined;
  locale: string;
  onDone: (name: string) => void;
  /** Leave it out where there is nothing to cancel back to. */
  onCancel?: (() => void) | undefined;
  onBusyChange: (busy: boolean) => void;
}) {
  const open = accounts.filter((a) => !a.archived);
  // A bill keeps its account when that has since been archived.
  const choices = accounts.filter(
    (a) => !a.archived || a.id === bill?.accountId,
  );
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
  const [priced, setPriced] = useState(bill?.price != null);
  const [priceCurrency, setPriceCurrency] = useState(
    bill?.price?.currency ?? '',
  );
  const [priceText, setPriceText] = useState(
    bill?.price == null ? '' : formatMoneyInput(bill.price, locale),
  );
  const [categoryId, setCategoryId] = useState(bill?.categoryId ?? '');
  const [amountError, setAmountError] = useState<AmountError>();
  const [priceError, setPriceError] = useState<AmountError>();
  const [priceCurrencyMissing, setPriceCurrencyMissing] = useState(false);
  const [accountMissing, setAccountMissing] = useState(false);
  const activeId = useId();
  const pricedId = useId();
  const currencyOptions = useCurrencyOptions(locale).filter(
    (o) => o.code !== currency,
  );
  const save = useBillChange(
    ({ amount: parsed, price }: { amount: Money; price: Money | null }) => {
      const category = categoryId === '' ? null : categoryId;
      return bill === undefined
        ? createBill({
            name: name.trim(),
            accountId,
            amount: parsed,
            ...(price === null ? {} : { price }),
            ...(category === null ? {} : { categoryId: category }),
            dueDay,
          })
        : updateBill(bill.id, {
            name: name.trim(),
            amount: parsed,
            dueDay,
            active,
            ...(accountId === bill.accountId ? {} : { accountId }),
            ...(price === null && bill.price === null ? {} : { price }),
            ...(category === bill.categoryId ? {} : { categoryId: category }),
          });
    },
  );
  useBusy(save.isPending, onBusyChange);
  const problem = save.isError ? describeProblem(save.error) : null;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = accountId === '' || currency === '';
    const parsed = missing ? null : parseBillAmount(amount, currency, locale);
    const currencyMissing =
      priced && (priceCurrency === '' || priceCurrency === currency);
    const price =
      !priced || currencyMissing
        ? null
        : parseBillAmount(priceText, priceCurrency, locale);
    setAccountMissing(missing);
    setAmountError(parsed !== null && !parsed.ok ? parsed.error : undefined);
    setPriceCurrencyMissing(currencyMissing);
    setPriceError(price !== null && !price.ok ? price.error : undefined);
    const firstInvalid = missing
      ? 'accountId'
      : currencyMissing
        ? 'priceCurrency'
        : price !== null && !price.ok
          ? 'price'
          : parsed === null || !parsed.ok
            ? 'amount'
            : null;
    if (firstInvalid !== null || parsed === null || !parsed.ok) {
      const field = event.currentTarget.elements.namedItem(
        firstInvalid ?? 'amount',
      );
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    save.mutate(
      {
        amount: parsed.amount,
        price: price?.ok === true ? price.amount : null,
      },
      {
        onSuccess: (saved) => {
          onDone(saved.name);
        },
      },
    );
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
            {choices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        )}
      </FieldControl>
      <div className="flex items-start gap-3">
        <input
          id={pricedId}
          type="checkbox"
          name="priced"
          checked={priced}
          aria-describedby={`${pricedId}-hint`}
          onChange={(e) => {
            setPriced(e.currentTarget.checked);
            setPriceError(undefined);
            setPriceCurrencyMissing(false);
          }}
          className="mt-1 size-4 accent-primary"
        />
        <div>
          <label htmlFor={pricedId} className="font-medium">
            {t('settings.bills.priced')}
          </label>
          <p id={`${pricedId}-hint`} className="text-sm text-text-muted">
            {t('settings.bills.pricedHint')}
          </p>
        </div>
      </div>
      {priced ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <FieldControl
            label={t('settings.bills.priceCurrency')}
            error={
              priceCurrencyMissing
                ? t('settings.bills.errors.priceCurrency')
                : undefined
            }
          >
            {(props) => (
              <select
                {...props}
                name="priceCurrency"
                value={priceCurrency === currency ? '' : priceCurrency}
                className={selectClass}
                onChange={(e) => {
                  setPriceCurrency(e.currentTarget.value);
                  setPriceCurrencyMissing(false);
                  setPriceError(undefined);
                }}
              >
                <option value="">{t('settings.rates.chooseCurrency')}</option>
                {currencyOptions.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </FieldControl>
          <FieldControl
            label={
              priceCurrency === '' || priceCurrency === currency
                ? t('settings.bills.amount')
                : t('settings.bills.priceIn', { currency: priceCurrency })
            }
            error={amountErrorText(priceError, priceCurrency, locale)}
          >
            {(props) => (
              <Input
                {...props}
                name="price"
                value={priceText}
                inputMode="decimal"
                autoComplete="off"
                className="h-11 text-base"
                onChange={(e) => {
                  setPriceText(e.currentTarget.value);
                  setPriceError(undefined);
                }}
              />
            )}
          </FieldControl>
        </div>
      ) : null}
      <FieldControl
        label={
          currency === ''
            ? t('settings.bills.amount')
            : priced
              ? t('settings.bills.estimateIn', { currency })
              : t('settings.bills.amountIn', { currency })
        }
        hint={priced ? t('settings.bills.estimateHint') : undefined}
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
      {categories === undefined ? null : (
        <CategorySelect
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          label={t('settings.bills.category')}
          hint={t('settings.bills.categoryHint')}
        />
      )}
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

const isDay = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text);

// Paying a due date either records the expense or links the entry that
// already paid it, so the reserve and the balance always move together.
function PayBill({
  bill,
  due,
  account,
  categories,
  linked,
  today,
  locale,
  onDone,
  onCancel,
  onBusyChange,
}: {
  bill: BillView;
  due: CycleBill;
  account: AccountView | undefined;
  categories: readonly CategoryView[];
  /** Entries that already pay a bill. */
  linked: ReadonlySet<string>;
  today: LocalDate;
  locale: string;
  onDone: (paid: Money, how: PayHow) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const currency = due.amount.currency;
  const priceCurrency = bill.price?.currency ?? '';
  const howName = useId();
  const [how, setHow] = useState<PayHow>('record');
  const [paidText, setPaidText] = useState(
    formatMoneyInput(due.amount, locale),
  );
  const [priceText, setPriceText] = useState(
    bill.price === null ? '' : formatMoneyInput(bill.price, locale),
  );
  const [paidOn, setPaidOn] = useState<string>(today);
  const [categoryId, setCategoryId] = useState(bill.categoryId ?? '');
  const [entryId, setEntryId] = useState('');
  const [paidError, setPaidError] = useState<AmountError>();
  const [priceError, setPriceError] = useState<AmountError>();
  const [paidOnInvalid, setPaidOnInvalid] = useState(false);
  const [categoryMissing, setCategoryMissing] = useState(false);
  const [entryMissing, setEntryMissing] = useState(false);
  const pay = useBillChange(
    (body: CreateBillPaymentBody) => payBill(bill.id, body),
    billPaymentQueryKeys,
  );
  useBusy(pay.isPending, onBusyChange);
  const problem = pay.isError ? describeProblem(pay.error) : null;
  const since = addDays(due.dueOn, -LINK_DAYS_BEFORE);
  const entries = useQuery({
    ...accountEntriesQuery(bill.accountId, since, today),
    enabled: how === 'link',
  });
  const candidates =
    entries.data === undefined
      ? []
      : linkCandidates(entries.data.transactions, bill.accountId, linked);
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? null;

  const paid = parseBillAmount(paidText, currency, locale);
  const price =
    priceCurrency === ''
      ? null
      : parseBillAmount(priceText, priceCurrency, locale);
  const unit =
    paid.ok && price?.ok === true ? paidUnit(paid.amount, price.amount) : null;

  function choose(next: PayHow) {
    if (pay.isError) pay.reset();
    setHow(next);
  }

  function link(form: HTMLFormElement) {
    const chosen = candidates.find((c) => c.entry.id === entryId);
    setEntryMissing(chosen === undefined);
    if (chosen === undefined) {
      const field = form.elements.namedItem('entryId');
      const first = field instanceof RadioNodeList ? field[0] : field;
      if (first instanceof HTMLElement) first.focus();
      return;
    }
    pay.mutate(
      { dueOn: due.dueOn, transactionId: chosen.entry.id },
      {
        onSuccess: () => {
          onDone(chosen.took, 'link');
        },
      },
    );
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (how === 'link') {
      link(event.currentTarget);
      return;
    }
    const badDay = !isDay(paidOn) || paidOn > today;
    const noCategory = categoryId === '';
    setPaidError(paid.ok ? undefined : paid.error);
    setPriceError(price === null || price.ok ? undefined : price.error);
    setPaidOnInvalid(badDay);
    setCategoryMissing(noCategory);
    const firstInvalid = !paid.ok
      ? 'paid'
      : price !== null && !price.ok
        ? 'price'
        : badDay
          ? 'paidOn'
          : noCategory
            ? 'categoryId'
            : null;
    if (firstInvalid !== null || !paid.ok || (price !== null && !price.ok)) {
      const field = event.currentTarget.elements.namedItem(
        firstInvalid ?? 'paid',
      );
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    pay.mutate(
      {
        dueOn: due.dueOn,
        paidOn: localDate(paidOn),
        paid: paid.amount,
        ...(price === null ? {} : { price: price.amount }),
        categoryId,
      },
      {
        onSuccess: () => {
          onDone(paid.amount, 'record');
        },
      },
    );
  }

  return (
    <form className="mt-4 grid gap-5" onSubmit={submit} noValidate>
      <p>
        {t('settings.bills.payIntro', {
          day: formatLongDay(due.dueOn, locale),
          account: account?.name ?? '',
        })}
      </p>
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">
          {t('settings.bills.payHow')}
        </legend>
        <label className="flex cursor-pointer gap-3">
          <input
            type="radio"
            name={howName}
            value="record"
            checked={how === 'record'}
            onChange={() => {
              choose('record');
            }}
            className="mt-1 accent-primary"
          />
          <span className="grid gap-0.5">
            <span>{t('settings.bills.payRecord')}</span>
            <span className="text-sm text-text-muted">
              {t('settings.bills.payRecordHint', {
                account: account?.name ?? '',
              })}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3">
          <input
            type="radio"
            name={howName}
            value="link"
            checked={how === 'link'}
            onChange={() => {
              choose('link');
            }}
            className="mt-1 accent-primary"
          />
          <span className="grid gap-0.5">
            <span>{t('settings.bills.payLink')}</span>
            <span className="text-sm text-text-muted">
              {t('settings.bills.payLinkHint')}
            </span>
          </span>
        </label>
      </fieldset>
      {how === 'link' ? (
        <fieldset
          className="grid gap-3"
          aria-describedby={entryMissing ? `${howName}-entry-error` : undefined}
        >
          <legend className="mb-2 text-sm font-medium">
            {t('settings.bills.linkLegend', {
              account: account?.name ?? '',
              day: formatLongDay(since, locale),
            })}
          </legend>
          {entries.isPending ? (
            <p className="text-sm text-text-muted">{t('ui.loading')}</p>
          ) : entries.isError ? (
            <p role="alert" className="text-sm font-medium text-negative">
              {errorMessage(entries.error)}
            </p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-text-muted">
              {t('settings.bills.linkNone')}
            </p>
          ) : (
            candidates.map(({ entry, took }) => (
              <label key={entry.id} className="flex cursor-pointer gap-3">
                <input
                  type="radio"
                  name="entryId"
                  value={entry.id}
                  checked={entryId === entry.id}
                  onChange={() => {
                    if (pay.isError) pay.reset();
                    setEntryId(entry.id);
                    setEntryMissing(false);
                  }}
                  className="mt-1 accent-primary"
                />
                <span className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-x-3">
                  <span className="wrap-anywhere">
                    {entry.note ??
                      categoryName(entry.categoryId) ??
                      t('settings.bills.linkUntitled')}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(took, locale)}
                  </span>
                  <span className="text-sm text-text-muted">
                    {formatLongDay(entry.occurredOn, locale)}
                  </span>
                </span>
              </label>
            ))
          )}
          {entryMissing ? (
            <p
              id={`${howName}-entry-error`}
              className="text-sm font-medium text-negative"
            >
              {t('settings.bills.errors.linkRequired')}
            </p>
          ) : null}
        </fieldset>
      ) : (
        <>
          {priceCurrency === '' ? null : (
            <FieldControl
              label={t('settings.bills.priceIn', { currency: priceCurrency })}
              error={amountErrorText(priceError, priceCurrency, locale)}
            >
              {(props) => (
                <Input
                  {...props}
                  name="price"
                  value={priceText}
                  inputMode="decimal"
                  autoComplete="off"
                  className="h-11 text-base"
                  onChange={(e) => {
                    setPriceText(e.currentTarget.value);
                    setPriceError(undefined);
                  }}
                />
              )}
            </FieldControl>
          )}
          <FieldControl
            label={t('settings.bills.paid', { currency })}
            hint={t('settings.bills.paidHint')}
            error={amountErrorText(paidError, currency, locale)}
          >
            {(props) => (
              <Input
                {...props}
                name="paid"
                value={paidText}
                inputMode="decimal"
                autoComplete="off"
                className="h-11 text-base"
                onChange={(e) => {
                  setPaidText(e.currentTarget.value);
                  setPaidError(undefined);
                }}
              />
            )}
          </FieldControl>
          {unit === null || price === null || !price.ok ? null : (
            <p
              className="text-sm text-text-muted tabular-nums"
              aria-live="polite"
            >
              {t('settings.bills.paidRate', {
                currency: priceCurrency,
                unit: formatMoney(unit, locale),
              })}
            </p>
          )}
          <FieldControl
            label={t('settings.bills.paidOnLabel')}
            error={
              paidOnInvalid ? t('settings.bills.errors.paidOn') : undefined
            }
          >
            {(props) => (
              <Input
                {...props}
                name="paidOn"
                type="date"
                max={today}
                className="h-11 text-base"
                value={paidOn}
                onChange={(e) => {
                  setPaidOn(e.currentTarget.value);
                  setPaidOnInvalid(false);
                }}
              />
            )}
          </FieldControl>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={(id) => {
              setCategoryId(id);
              setCategoryMissing(false);
            }}
            label={t('settings.bills.category')}
            error={
              categoryMissing
                ? t('settings.bills.errors.categoryRequired')
                : undefined
            }
          />
        </>
      )}
      <FormError message={problem?.message ?? null} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11" disabled={pay.isPending}>
          {pay.isPending
            ? t('settings.saving')
            : how === 'link'
              ? t('settings.bills.linkSubmit')
              : t('settings.bills.paySubmit')}
        </Button>
        <Button
          type="button"
          variant="outlined"
          className="h-11"
          disabled={pay.isPending}
          onClick={onCancel}
        >
          {t('settings.cancel')}
        </Button>
      </div>
    </form>
  );
}

// The price's rates under a priced bill: what the last payment worked out
// to, and the latest stored rate, if there is one.
function RateLines({
  bill,
  price,
  rates,
  locale,
}: {
  bill: BillView;
  price: Money;
  rates: readonly ExchangeRateView[];
  locale: string;
}) {
  const last = lastPricedPayment(bill);
  const stored = storedUnit(rates, price.currency, bill.amount.currency);
  if (last === null && stored === null) return null;
  return (
    <div className="grid gap-0.5 text-sm text-text-muted tabular-nums">
      {last === null ? null : (
        <p>
          {t('settings.bills.lastPaid', {
            amount: formatMoney(last.paid, locale),
            currency: last.price.currency,
            unit: formatMoney(paidUnit(last.paid, last.price), locale),
          })}
        </p>
      )}
      {stored === null ? null : (
        <p>
          {t('settings.bills.storedRate', {
            currency: price.currency,
            unit: formatMoney(stored.unit, locale),
            day: formatLongDay(stored.asOf, locale),
          })}
        </p>
      )}
    </div>
  );
}

function DueLine({
  bill,
  due,
  locale,
  onPay,
  onAnnounce,
}: {
  bill: BillView;
  due: CycleBill;
  locale: string;
  /** Opens the payment sheet. */
  onPay: () => void;
  onAnnounce: (message: string) => void;
}) {
  const unpay = useBillChange(
    () => unpayBill(bill.id, due.dueOn),
    billPaymentQueryKeys,
  );
  const day = formatLongDay(due.dueOn, locale);
  const paid = due.paidOn !== null;
  const payment = bill.payments.find((p) => p.dueOn === due.dueOn);
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-sm">
        {paid
          ? t('settings.bills.paidOn', {
              day,
              paidOn: formatLongDay(due.paidOn ?? due.dueOn, locale),
            })
          : t('settings.bills.reserved', { day })}
        {payment?.paid == null ? null : (
          <span className="font-mono tabular-nums">
            {' · '}
            {formatMoney(payment.paid, locale)}
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {unpay.isError ? (
          <span role="alert" className="text-sm font-medium text-negative">
            {errorMessage(unpay.error)}
          </span>
        ) : null}
        <Button
          variant="outlined"
          size="dense"
          disabled={unpay.isPending}
          onClick={() => {
            if (!paid) {
              onPay();
              return;
            }
            unpay.mutate(undefined, {
              onSuccess: () => {
                const names = { name: bill.name, day };
                onAnnounce(
                  payment?.recorded === true
                    ? t('settings.bills.announce.unrecorded', names)
                    : t('settings.bills.announce.unpaid', names),
                );
              },
            });
          }}
        >
          {paid ? t('settings.bills.undoPaid') : t('settings.bills.pay')}
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
  rates,
  locale,
  onOpen,
  onAnnounce,
}: {
  bill: BillView;
  account: AccountView | undefined;
  cycleBills: readonly CycleBill[];
  rates: readonly ExchangeRateView[];
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
        <div className="text-right">
          <p className="font-mono text-lg tabular-nums wrap-anywhere">
            {formatMoney(bill.price ?? bill.amount, locale)}
          </p>
          {bill.price === null ? null : (
            <p className="text-sm text-text-muted tabular-nums">
              {t('settings.bills.setAside', {
                amount: formatMoney(bill.reserve, locale),
              })}
            </p>
          )}
        </div>
      </div>
      {bill.price === null ? null : (
        <RateLines
          bill={bill}
          price={bill.price}
          rates={rates}
          locale={locale}
        />
      )}
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
                onPay={() => {
                  onOpen({ kind: 'pay', bill, due: d });
                }}
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
  categories,
  rates,
  today,
  locale,
}: {
  bills: readonly BillView[];
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  rates: readonly ExchangeRateView[];
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
          : open.kind === 'pay'
            ? t('settings.bills.payTitle', { name: open.bill.name })
            : t('settings.bills.deleteTitle', { name: open.bill.name });
  const hasAccounts = accounts.some((a) => !a.archived);
  const linked = new Set(
    bills.flatMap((b) =>
      b.payments.flatMap((p) =>
        p.transactionId === null ? [] : [p.transactionId],
      ),
    ),
  );

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
              rates={rates}
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
        {open === null ? null : open.kind === 'pay' ? (
          <PayBill
            bill={open.bill}
            due={open.due}
            account={accounts.find((a) => a.id === open.bill.accountId)}
            categories={categories}
            linked={linked}
            today={today.today}
            locale={locale}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={(paid, how) => {
              close();
              setAnnouncement(
                t(
                  how === 'link'
                    ? 'settings.bills.announce.linked'
                    : 'settings.bills.announce.recorded',
                  {
                    name: open.bill.name,
                    day: formatLongDay(open.due.dueOn, locale),
                    amount: formatMoney(paid, locale),
                  },
                ),
              );
            }}
          />
        ) : open.kind === 'delete' ? (
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
            categories={categories}
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
