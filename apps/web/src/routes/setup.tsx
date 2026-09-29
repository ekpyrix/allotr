import { setupSteps, type SetupState, type SetupStep } from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { PageState } from '@/features/cycles/parts';
import {
  AccountsStep,
  BillsStep,
  PaydayStep,
  RegionStep,
} from '@/features/setup/steps';
import { accountsQuery, ledgerSettingsQuery, todayQuery } from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { billsQuery } from '@/lib/settings';
import { afterStep, nextStep, saveSetup, setupQuery } from '@/lib/setup';
import { t } from '@/messages/t';

function useSaveSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveSetup,
    onSuccess: (saved) => {
      queryClient.setQueryData(setupQuery.queryKey, saved);
    },
  });
}

// Setup after first sign-in (FR-W7): currency and region, payday, spending
// accounts, savings, bills, then Today with a first daily number. Progress
// is saved after every step, so signing in again resumes where it stopped.
export function SetupPage() {
  const setup = useQuery(setupQuery);
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const accounts = useQuery(accountsQuery);
  const bills = useQuery(billsQuery);
  const save = useSaveSetup();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const step = setup.data === undefined ? null : nextStep(setup.data);
  const shown = useRef<SetupStep | null>(null);

  // A new step takes focus on its heading, which says where the user is.
  useEffect(() => {
    if (step === null) return;
    if (shown.current !== null && shown.current !== step)
      heading.current?.focus();
    shown.current = step;
  }, [step]);

  if (
    setup.data === undefined ||
    settings.data === undefined ||
    today.data === undefined ||
    accounts.data === undefined ||
    bills.data === undefined ||
    step === null
  )
    return (
      <PageState
        title={t('setup.title')}
        loading={t('setup.loading')}
        queries={[setup, settings, today, accounts, bills]}
      />
    );

  const state = setup.data;
  const go = (next: SetupState) => {
    save.mutate(next, {
      onSuccess: (saved) => {
        if (saved.finished) void navigate({ to: '/today' });
      },
    });
  };
  const handled = () => {
    setAnnouncement('');
    go(afterStep(state, step));
  };
  const props = {
    busy: save.isPending,
    onNext: handled,
    onSkip: handled,
  };
  const number = setupSteps.indexOf(step) + 1;

  return (
    <Page title={t('setup.title')} intro={t('setup.intro')}>
      <section aria-labelledby="setup-step" className="mt-8">
        <h2
          id="setup-step"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          {t('setup.step', {
            n: number,
            total: setupSteps.length,
            title: t(`setup.${step}.title`),
          })}
        </h2>
        <p className="mt-1 max-w-prose text-muted-foreground">
          {t(`setup.${step}.intro`)}
        </p>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {step === 'region' ? (
          <RegionStep settings={settings.data} {...props} />
        ) : step === 'payday' ? (
          <PaydayStep settings={settings.data} {...props} />
        ) : step === 'spending' || step === 'savings' ? (
          <AccountsStep
            key={step}
            group={step === 'spending' ? 'on' : 'off'}
            accounts={accounts.data.accounts}
            settings={settings.data}
            today={today.data.today}
            onAnnounce={setAnnouncement}
            {...props}
          />
        ) : (
          <BillsStep
            bills={bills.data.bills}
            accounts={accounts.data.accounts}
            locale={settings.data.locale}
            onAnnounce={setAnnouncement}
            {...props}
          />
        )}
        <FormError message={save.isError ? errorMessage(save.error) : null} />
      </section>

      <div className="mt-12 border-t pt-6">
        {step === 'region' ? (
          <p className="mb-3 max-w-prose text-sm text-muted-foreground">
            {t('setup.importHint')}
          </p>
        ) : null}
        <Button
          type="button"
          variant="link"
          className="h-11 px-0"
          disabled={save.isPending}
          aria-describedby="setup-skip-rest-hint"
          onClick={() => {
            go({ ...state, finished: true });
          }}
        >
          {t('setup.skipRest')}
        </Button>
        <p
          id="setup-skip-rest-hint"
          className="max-w-prose text-sm text-muted-foreground"
        >
          {t('setup.skipRestHint')}
        </p>
      </div>
    </Page>
  );
}
