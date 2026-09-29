import type { SessionView } from '@allotr/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { ShortcutsSwitch } from '@/components/shortcuts-switch';
import { ThemeModeSwitch } from '@/components/theme-mode-switch';
import { Button } from '@/components/ui/button';
import { hashTarget } from '@/features/settings/hash-target';
import { LedgerSettingsSection } from '@/features/settings/ledger-settings';
import { Section } from '@/features/settings/section';
import { ledgerSettingsQuery, todayQuery } from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { signOut } from '@/lib/session';
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

function SignOutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <Button
      variant="outline"
      className="mt-6 h-11"
      onClick={() => {
        void signOut(queryClient).then(() => navigate({ to: '/sign-in' }));
      }}
    >
      {t('settings.signOut')}
    </Button>
  );
}

// The settings view (FR-W2): one page of sections, each with its own hash.
export function SettingsPage({ session }: { session: SessionView }) {
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const all = [settings, today];
  const ready = settings.data !== undefined && today.data !== undefined;
  useHashFocus(ready);

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

  if (settings.data === undefined || today.data === undefined)
    return (
      <Page title={t('settings.title')}>
        <p role="status" className="mt-6 text-muted-foreground">
          {t('settings.loading')}
        </p>
      </Page>
    );

  return (
    <Page title={t('settings.title')}>
      <LedgerSettingsSection settings={settings.data} today={today.data} />
      <Section id="appearance" title={t('settings.appearance.title')}>
        <ThemeModeSwitch className="mt-4" />
        <ShortcutsSwitch className="mt-6" />
      </Section>
      <Section id="security" title={t('settings.security.title')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('settings.security.signedInAs', { email: session.user.email })}
        </p>
        <SignOutButton />
      </Section>
    </Page>
  );
}
