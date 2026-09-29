import type { SessionView } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { AppearanceSection } from '@/features/settings/appearance';
import { BillsSection } from '@/features/settings/bills';
import { CategoriesSection } from '@/features/settings/categories';
import { DeleteAccountSection } from '@/features/settings/delete-account';
import { hashTarget } from '@/features/settings/hash-target';
import { ExportSection } from '@/features/settings/export';
import { InstanceSection } from '@/features/settings/instance';
import { LedgerSettingsSection } from '@/features/settings/ledger-settings';
import { RatesSection } from '@/features/settings/rates';
import { SecuritySection } from '@/features/settings/security';
import { TagsSection } from '@/features/settings/tags';
import {
  allAccountsQuery,
  allCategoriesQuery,
  ledgerSettingsQuery,
  tagsQuery,
  todayQuery,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { sessionQuery } from '@/lib/session';
import { billsQuery, ratesQuery } from '@/lib/settings';
import { t } from '@/messages/t';

// Once the sections have rendered, `/settings#rates` scrolls to rates and
// focuses its heading. The shell moves focus to <main> after a route
// change in its own effect, which runs after this one, so wait a frame.
function useHashFocus(ready: boolean) {
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      const target = hashTarget(hash);
      if (target === null) return;
      target.scroll.scrollIntoView({ block: 'start' });
      target.focus.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [ready, hash]);
}

// This device's language and zone, for a user who cannot read their ledger
// settings until they enrol in 2FA.
const deviceLocale = navigator.language;
const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// The settings view (FR-W2): one page of sections, each with its own hash.
// The route context holds the session as it was on arrival; the query has
// it after enrolment or turning 2FA off.
export function SettingsPage({ session: initial }: { session: SessionView }) {
  const session = useQuery(sessionQuery).data ?? initial;
  // Until they enrol, the server refuses everything but the session.
  const enabled = !session.twoFactorRequired;
  const settings = useQuery({ ...ledgerSettingsQuery, enabled });
  const today = useQuery({ ...todayQuery, enabled });
  // Merged categories too: they name the merge targets of older merges.
  const categories = useQuery({ ...allCategoriesQuery, enabled });
  const tags = useQuery({ ...tagsQuery, enabled });
  const bills = useQuery({ ...billsQuery, enabled });
  const rates = useQuery({ ...ratesQuery, enabled });
  // Archived too: a bill can still name one.
  const accounts = useQuery({ ...allAccountsQuery, enabled });
  const all = [settings, today, categories, tags, bills, rates, accounts];
  // Wait for every answer, data or error, so a hash lower down does not
  // move when the ledger sections above it appear.
  const settled = all.every((q) => q.data !== undefined || q.isError);
  useHashFocus(!enabled || settled);

  const failed = all.find((q) => q.isError && q.data === undefined);
  // Before the ledger settings load (or when they cannot), dates in the
  // security sections use this device's language and zone.
  const locale = settings.data?.locale ?? deviceLocale;
  const timeZone = settings.data?.timeZone ?? deviceTimeZone;

  // A failing ledger query only takes its own sections down: security and
  // sign-out stay reachable.
  let ledger;
  if (!enabled) ledger = null;
  else if (failed !== undefined)
    ledger = (
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
    );
  else if (
    settings.data === undefined ||
    today.data === undefined ||
    categories.data === undefined ||
    tags.data === undefined ||
    bills.data === undefined ||
    rates.data === undefined ||
    accounts.data === undefined
  )
    ledger = (
      <p role="status" className="mt-6 text-muted-foreground">
        {t('settings.loading')}
      </p>
    );
  else
    ledger = (
      <>
        <LedgerSettingsSection settings={settings.data} today={today.data} />
        <CategoriesSection categories={categories.data.categories} />
        <TagsSection tags={tags.data.tags} />
        <BillsSection
          bills={bills.data.bills}
          accounts={accounts.data.accounts}
          today={today.data}
          locale={locale}
        />
        <RatesSection
          rates={rates.data.rates}
          today={today.data}
          defaultCurrency={settings.data.defaultCurrency}
          locale={locale}
        />
        <ExportSection />
      </>
    );

  return (
    <Page title={t('settings.title')}>
      {ledger}
      {enabled ? <AppearanceSection userId={session.user.id} /> : null}
      <SecuritySection session={session} locale={locale} timeZone={timeZone} />
      {enabled && session.user.role === 'admin' ? (
        <InstanceSection locale={locale} timeZone={timeZone} />
      ) : null}
      <DeleteAccountSection session={session} />
    </Page>
  );
}
