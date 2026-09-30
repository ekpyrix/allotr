import {
  formatMoney,
  money,
  type CycleDayView,
  type Money,
  type TodayView,
} from '@allotr/shared';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { DigitRoller } from '@/motion/digit-roller';
import { formatAbs } from './format.ts';
import { PaceSpark } from './pace-spark.tsx';
import type { HeroState } from './state.ts';

// The hero card (spec §11.1): left today as a rolling mono figure in the
// hero colour for its state, a status chip that says the state in words,
// the live daily figure, the pace spark and the way into the waterfall.
// It carries the `hero` view-transition name the Cycle header shares.

const CYCLE_KEY = 'allotr.hero-cycle';

// On a new cycle (payday), the figure rolls up from zero once; the cycle
// last seen is kept for the browser session.
function useRollUp(openedOn: string, zero: string, value: string): string {
  const [shown, setShown] = useState(() => {
    try {
      return sessionStorage.getItem(CYCLE_KEY) === openedOn ? value : zero;
    } catch {
      return value;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(CYCLE_KEY, openedOn);
    } catch {
      // Without storage the figure simply shows.
    }
    const frame = requestAnimationFrame(() => {
      setShown(value);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [openedOn, value]);
  return shown;
}

const colour: Record<HeroState, string> = {
  ok: 'text-hero-ok',
  tight: 'text-hero-tight',
  over: 'text-hero-over',
};

export function HeroCard({
  figures,
  state,
  days,
  budget,
  locale,
  explain,
}: {
  figures: TodayView;
  state: HeroState;
  days: readonly CycleDayView[] | undefined;
  budget: Money | undefined;
  locale: string;
  /** The "How is this worked out?" control. */
  explain: ReactNode;
}) {
  const { leftToday } = figures;
  const over = state === 'over';
  const value = over
    ? formatAbs(leftToday, locale)
    : formatMoney(leftToday, locale);
  const shown = useRollUp(
    figures.cycle.openedOn,
    formatMoney(money(0, leftToday.currency), locale),
    value,
  );
  const label = over ? t('today.over', { amount: value }) : value;

  return (
    <Card variant="hero" className="[view-transition-name:hero]">
      <h2 className="text-label text-text-muted">{t('today.title')}</h2>
      <p className={cn('mt-2 text-display-hero wrap-anywhere', colour[state])}>
        {over ? (
          <span aria-hidden="true" className="mr-2 font-mono text-display">
            −
          </span>
        ) : null}
        <DigitRoller value={shown} label={label} testId="left-today" />
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state === 'ok' ? (
          <StatusChip tone="success" icon={<CircleCheck />}>
            {t('today.status.ok')}
          </StatusChip>
        ) : state === 'tight' ? (
          <StatusChip tone="warning" icon={<TriangleAlert />}>
            {t('today.status.tight')}
          </StatusChip>
        ) : (
          <StatusChip tone="danger" icon={<CircleAlert />}>
            {t('today.over', { amount: value })}
          </StatusChip>
        )}
        <p className="font-mono text-body-lg tabular-nums">
          {t('today.liveDaily', {
            amount: formatMoney(figures.liveDaily, locale),
            count: figures.daysLeft,
          })}
        </p>
      </div>
      {over ? (
        <p className="mt-3 max-w-prose text-body">{t('today.overHint')}</p>
      ) : null}
      {days === undefined || budget === undefined ? null : (
        <PaceSpark days={days} budget={budget} locale={locale} />
      )}
      {explain}
    </Card>
  );
}
