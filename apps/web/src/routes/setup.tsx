import {
  formatMoney,
  setupSteps,
  type SetupState,
  type SetupStep,
  type TodayView,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { StepPills } from '@/components/step-pills';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageState } from '@/features/cycles/parts';
import { formatLongDay } from '@/features/today/format';
import {
  AccountsStep,
  BillsStep,
  PaydayStep,
  RegionStep,
} from '@/features/setup/steps';
import { accountsQuery, ledgerSettingsQuery, todayQuery } from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { billsQuery } from '@/lib/settings';
import {
  afterStep,
  followingStep,
  nextStep,
  previousStep,
  saveSetup,
  setupQuery,
} from '@/lib/setup';
import { t } from '@/messages/t';
import { DigitRoller } from '@/motion/digit-roller';

function useSaveSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveSetup,
    onSuccess: (saved) => {
      queryClient.setQueryData(setupQuery.queryKey, saved);
    },
  });
}

// The end of setup (spec §11.7): the first daily number rolls up from
// zero, with the days to payday under it. The figure is the server's;
// only its digits start at 0 for the roll.
function FirstNumber({
  today,
  locale,
  total,
  onGo,
}: {
  today: TodayView;
  locale: string;
  total: number;
  onGo: () => void;
}) {
  const value = formatMoney(today.leftToday, locale);
  const [shown, setShown] = useState(() => value.replace(/\d/gu, '0'));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShown(value);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return (
    <Card variant="hero" className="axis-in grid gap-4">
      <StepPills current={total + 1} total={total} />
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-title-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        {t('setup.reveal.title')}
      </h2>
      <p className="text-text-muted">{t('setup.reveal.intro')}</p>
      <p className="text-display text-hero-ok">
        <DigitRoller value={shown} label={value} testId="first-number" />
      </p>
      <p>
        {today.overdue
          ? t('cycle.overdue')
          : t('cycle.payday', {
              date: formatLongDay(today.cycleEnd, locale),
              count: today.daysLeft,
            })}
      </p>
      <Button className="w-fit" onClick={onGo}>
        {t('setup.reveal.go')}
      </Button>
    </Card>
  );
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
  // A step the user went Back to; otherwise the first one not handled.
  const [viewing, setViewing] = useState<SetupStep | null>(null);
  const step =
    setup.data === undefined ? null : (viewing ?? nextStep(setup.data));
  const shown = useRef<SetupStep | null>(null);
  // The first step shown is simply there; later ones slide in.
  const [first, setFirst] = useState<SetupStep | null>(null);
  if (first === null && step !== null) setFirst(step);
  const [revealed, setRevealed] = useState(false);
  const queryClient = useQueryClient();

  // A new step takes focus on its heading, which says where the user is.
  useEffect(() => {
    if (step === null) return;
    if (shown.current !== null && shown.current !== step)
      heading.current?.focus();
    shown.current = step;
  }, [step]);

  if (revealed && settings.data !== undefined && today.data !== undefined)
    return (
      <Page title={t('setup.title')}>
        <div className="mx-auto mt-8 w-full max-w-[440px]">
          <FirstNumber
            today={today.data}
            locale={settings.data.locale}
            total={setupSteps.length}
            onGo={() => {
              void navigate({ to: '/' });
            }}
          />
        </div>
      </Page>
    );

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
  // Finishing the last step shows the first number; skipping the rest
  // goes straight to Today.
  const go = (next: SetupState, reveal: boolean) => {
    save.mutate(next, {
      onSuccess: (saved) => {
        if (!saved.finished) {
          // Moving on from a step reached with Back shows the one after it.
          if (viewing !== null) setViewing(followingStep(step));
          return;
        }
        if (!reveal) {
          void navigate({ to: '/' });
          return;
        }
        void queryClient
          .invalidateQueries({ queryKey: todayQuery.queryKey })
          .then(() => {
            setRevealed(true);
          });
      },
    });
  };
  const handled = () => {
    setAnnouncement('');
    go(afterStep(state, step), true);
  };
  const props = {
    busy: save.isPending,
    onNext: handled,
    onSkip: handled,
  };
  const number = setupSteps.indexOf(step) + 1;
  const before = previousStep(step);

  return (
    <Page title={t('setup.title')} intro={t('setup.intro')}>
      <div className="mx-auto mt-8 grid w-full max-w-[440px] gap-6">
        <Card className="grid gap-5 overflow-hidden rounded-2xl p-6 medium:p-8">
          <StepPills current={number} total={setupSteps.length} />
          <section
            key={step}
            aria-labelledby="setup-step"
            className={step === first ? undefined : 'axis-in'}
          >
            <h2
              id="setup-step"
              ref={heading}
              tabIndex={-1}
              className="text-title-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {t('setup.step', {
                n: number,
                total: setupSteps.length,
                title: t(`setup.${step}.title`),
              })}
            </h2>
            <p className="mt-1 max-w-prose text-text-muted">
              {t(`setup.${step}.intro`)}
            </p>
            <p aria-live="polite" className="sr-only">
              {announcement}
            </p>
            {step === 'region' ? (
              <RegionStep
                settings={settings.data}
                detect={!state.handled.includes('region')}
                {...props}
              />
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
            <FormError
              message={save.isError ? errorMessage(save.error) : null}
            />
            {before === null ? null : (
              <Button
                type="button"
                variant="link"
                className="mt-2 h-11 px-0"
                disabled={save.isPending}
                onClick={() => {
                  setAnnouncement('');
                  save.reset();
                  setViewing(before);
                }}
              >
                {t('setup.back')}
              </Button>
            )}
          </section>
        </Card>

        <div className="px-2">
          {step === 'region' ? (
            <p className="mb-3 max-w-prose text-sm text-text-muted">
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
              go({ ...state, finished: true }, false);
            }}
          >
            {t('setup.skipRest')}
          </Button>
          <p
            id="setup-skip-rest-hint"
            className="max-w-prose text-sm text-text-muted"
          >
            {t('setup.skipRestHint')}
          </p>
        </div>
      </div>
    </Page>
  );
}
