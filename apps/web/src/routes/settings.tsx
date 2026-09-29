import type { SessionView } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { ShortcutsSwitch } from '@/components/shortcuts-switch';
import { ThemeModeSwitch } from '@/components/theme-mode-switch';
import { Button } from '@/components/ui/button';
import { BillsSection } from '@/features/settings/bills';
import { CategoriesSection } from '@/features/settings/categories';
import { hashTarget } from '@/features/settings/hash-target';
import { LedgerSettingsSection } from '@/features/settings/ledger-settings';
import { RatesSection } from '@/features/settings/rates';
import { Section } from '@/features/settings/section';
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
  const ready = !enabled || all.every((q) => q.data !== undefined);
  useHashFocus(ready);

  if (!enabled)
    return (
      <Page title={t('settings.title')}>
        <SecuritySection
          session={session}
          locale={deviceLocale}
          timeZone={deviceTimeZone}
        />
      </Page>
    );

  const failed = all.find((q) => q.isError && q.data === undefined);
  if (failed !== undefined)
    return (
      <Page title={t('settings.title')}>
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
    settings.data === undefined ||
    today.data === undefined ||
    categories.data === undefined ||
    tags.data === undefined ||
    bills.data === undefined ||
    rates.data === undefined ||
    accounts.data === undefined
  )
    return (
      <Page title={t('settings.title')}>
        <p role="status" className="mt-6 text-muted-foreground">
          {t('settings.loading')}
        </p>
      </Page>
    );

  const { locale, timeZone, defaultCurrency } = settings.data;
  return (
    <Page title={t('settings.title')}>
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
        defaultCurrency={defaultCurrency}
        locale={locale}
      />
      <Section id="appearance" title={t('settings.appearance.title')}>
        <ThemeModeSwitch className="mt-4" />
        <ShortcutsSwitch className="mt-6" />
      </Section>
      <SecuritySection session={session} locale={locale} timeZone={timeZone} />
    </Page>
  );
}
