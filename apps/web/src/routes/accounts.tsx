import { formatMoney, type AccountView, type FigureView } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, TriangleAlert } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import {
  ArchiveFlow,
  BudgetSwitch,
  budgetTitle,
} from '@/features/accounts/account-actions';
import { CreateAccountForm } from '@/features/accounts/create-account-form';
import { groupAccounts } from '@/features/accounts/groups';
import { ReconcileFlow } from '@/features/accounts/reconcile-flow';
import { Sheet } from '@/features/accounts/sheet';
import { formatLongDay } from '@/features/ledger/format';
import {
  allAccountsQuery,
  ledgerSettingsQuery,
  todayQuery,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';

// The account as it was when its dialog opened: the list refetches before
// the dialog closes, and an archived account drops out of it.
type Open =
  | { kind: 'create' }
  | { kind: 'budget' | 'archive' | 'reconcile'; account: AccountView }
  | null;

const linkClass = 'font-medium underline underline-offset-4';

function GroupTotal({
  group,
  total,
  locale,
  defaultCurrency,
}: {
  group: 'on' | 'off';
  total: FigureView;
  locale: string;
  defaultCurrency: string;
}) {
  return (
    <div className="mt-3 grid gap-2">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-muted-foreground">
          {t('accounts.groups.total')}
        </span>
        <span
          data-testid={`total-${group}`}
          className="font-mono text-2xl font-semibold tabular-nums wrap-anywhere"
        >
          {formatMoney(total.amount, locale)}
        </span>
      </p>
      {total.missingRates.length === 0 ? null : (
        <ul className="grid gap-2">
          {total.missingRates.map((currency) => (
            <li
              key={currency}
              className="flex gap-3 rounded-md bg-plot p-3 text-sm"
            >
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-over"
              />
              <span className="grid gap-1">
                <span>
                  {t('accounts.missingRate', { currency, defaultCurrency })}
                </span>
                <Link to="/settings" hash="rates" className={linkClass}>
                  {t('accounts.missingRateAction', { currency })}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountRow({
  account,
  locale,
  onOpen,
}: {
  account: AccountView;
  locale: string;
  onOpen: (open: Open) => void;
}) {
  const nameId = useId();
  return (
    <li
      aria-labelledby={nameId}
      data-account-id={account.id}
      className="grid gap-3 rounded-md bg-plot p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 wrap-anywhere">
          <span id={nameId} className="font-medium">
            {account.name}
          </span>{' '}
          <span className="text-sm text-muted-foreground">
            {account.currency}
          </span>
        </p>
        <p
          data-testid="account-row-balance"
          className="font-mono text-lg tabular-nums wrap-anywhere"
        >
          {formatMoney(account.balance, locale)}
        </p>
        <p
          data-testid="account-row-reconciled"
          className="basis-full text-sm text-muted-foreground"
        >
          {account.lastReconciledOn === null
            ? t('accounts.neverReconciled')
            : t('accounts.lastReconciled', {
                date: formatLongDay(account.lastReconciledOn, locale),
              })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/ledger" search={{ account: account.id }}>
            {t('accounts.showEntries')}
            <span className="sr-only"> {account.name}</span>
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-action="budget"
          onClick={() => {
            onOpen({ kind: 'budget', account });
          }}
        >
          {account.budgetGroup === 'on'
            ? t('accounts.moveOff')
            : t('accounts.moveOn')}
          <span className="sr-only"> {account.name}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onOpen({ kind: 'reconcile', account });
          }}
        >
          {t('accounts.reconcile')}
          <span className="sr-only"> {account.name}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onOpen({ kind: 'archive', account });
          }}
        >
          {t('accounts.archive')}
          <span className="sr-only"> {account.name}</span>
        </Button>
      </div>
    </li>
  );
}

function Group({
  group,
  accounts,
  total,
  locale,
  defaultCurrency,
  onOpen,
}: {
  group: 'on' | 'off';
  accounts: readonly AccountView[];
  total: FigureView;
  locale: string;
  defaultCurrency: string;
  onOpen: (open: Open) => void;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="mt-10">
      <h2 id={heading} className="text-xl font-semibold">
        {t(`accounts.groups.${group}`)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(`accounts.groups.${group}Hint`)}
      </p>
      {group === 'off' ? (
        <p className="mt-1 text-sm">
          <Link to="/savings" className={linkClass}>
            {t('accounts.groups.savingsLink')}
          </Link>
        </p>
      ) : null}
      <GroupTotal
        group={group}
        total={total}
        locale={locale}
        defaultCurrency={defaultCurrency}
      />
      {accounts.length === 0 ? (
        <p className="mt-4 text-muted-foreground">
          {t('accounts.groups.none')}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              locale={locale}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// The accounts view (FR-W2, FR-L2, FR-L8): accounts by budget group with
// the server's balances and totals, and creating, moving and archiving
// accounts. The web app never adds or converts money itself.
export function AccountsPage() {
  const accounts = useQuery(allAccountsQuery);
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Read after the dialog has closed, when `open` is already null.
  const lastAccount = useRef<string | undefined>(undefined);
  const all = [accounts, settings, today];

  const failed = all.find((q) => q.isError && q.data === undefined);
  if (failed !== undefined)
    return (
      <Page title={t('accounts.title')}>
        <div className="mt-6 grid justify-items-start gap-4">
          <FormError message={errorMessage(failed.error)} />
          <Button
            onClick={() => {
              for (const q of all) if (q.isError) void q.refetch();
            }}
          >
            {t('errors.retry')}
          </Button>
        </div>
      </Page>
    );

  if (
    accounts.data === undefined ||
    settings.data === undefined ||
    today.data === undefined
  )
    return (
      <Page title={t('accounts.title')}>
        <p role="status" className="mt-6 text-muted-foreground">
          {t('accounts.loading')}
        </p>
      </Page>
    );

  const { locale, defaultCurrency } = settings.data;
  const list = accounts.data.accounts;
  const groups = groupAccounts(list);
  const selected =
    open === null || open.kind === 'create' ? undefined : open.account;
  const close = () => {
    setOpen(null);
  };
  const title =
    open?.kind === 'create'
      ? t('accounts.create.title')
      : selected === undefined
        ? ''
        : open?.kind === 'budget'
          ? budgetTitle(selected)
          : open?.kind === 'reconcile'
            ? t('accounts.reconcileFlow.title', { name: selected.name })
            : t('accounts.archiveFlow.title', { name: selected.name });
  const opening = (next: Open) => {
    lastAccount.current =
      next?.kind === 'create' ? undefined : next?.account.id;
    setAnnouncement('');
    setOpen(next);
  };

  return (
    <Page title={t('accounts.title')}>
      <Button
        className="mt-6"
        onClick={() => {
          opening({ kind: 'create' });
        }}
      >
        <Plus aria-hidden />
        {t('accounts.add')}
      </Button>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {list.length === 0 ? (
        <p className="mt-6 max-w-prose text-muted-foreground">
          {t('accounts.empty')}
        </p>
      ) : (
        <>
          {(['on', 'off'] as const).map((group) => (
            <Group
              key={group}
              group={group}
              accounts={groups[group]}
              total={accounts.data.totals[group]}
              locale={locale}
              defaultCurrency={defaultCurrency}
              onOpen={opening}
            />
          ))}
          {groups.archived.length === 0 ? null : (
            <details className="mt-10">
              <summary className="cursor-pointer font-medium">
                {t('accounts.archived.title', {
                  count: groups.archived.length,
                })}
              </summary>
              <ul className="mt-3 grid gap-2">
                {groups.archived.map((account) => (
                  <li key={account.id}>
                    <Link
                      to="/ledger"
                      search={{ account: account.id }}
                      className={linkClass}
                    >
                      {t('accounts.showEntriesOf', { name: account.name })}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <Sheet
        open={open?.kind === 'create' || selected !== undefined}
        title={title}
        busy={busy}
        onClose={close}
        // A moved account's row is rendered anew in its new group.
        fallback={() =>
          lastAccount.current === undefined
            ? null
            : document.querySelector<HTMLElement>(
                `[data-account-id="${CSS.escape(lastAccount.current)}"] [data-action="budget"]`,
              )
        }
      >
        {open?.kind === 'create' ? (
          <CreateAccountForm
            defaultCurrency={defaultCurrency}
            today={today.data.today}
            locale={locale}
            onBusyChange={setBusy}
            onCreated={(account) => {
              close();
              setAnnouncement(
                t('accounts.announce.created', { name: account.name }),
              );
            }}
          />
        ) : selected === undefined ? null : open?.kind === 'budget' ? (
          <BudgetSwitch
            account={selected}
            locale={locale}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={() => {
              close();
              setAnnouncement(
                selected.budgetGroup === 'on'
                  ? t('accounts.announce.movedOff', { name: selected.name })
                  : t('accounts.announce.movedOn', { name: selected.name }),
              );
            }}
          />
        ) : open?.kind === 'reconcile' ? (
          <ReconcileFlow
            account={selected}
            today={today.data.today}
            locale={locale}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={(outcome) => {
              close();
              setAnnouncement(
                outcome === 'matched'
                  ? t('accounts.announce.reconciled', { name: selected.name })
                  : t('accounts.announce.adjusted', { name: selected.name }),
              );
            }}
          />
        ) : (
          <ArchiveFlow
            account={selected}
            accounts={list}
            locale={locale}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={() => {
              close();
              setAnnouncement(
                t('accounts.announce.archived', { name: selected.name }),
              );
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}
