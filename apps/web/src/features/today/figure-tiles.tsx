import { formatMoney, type TodayView } from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { t } from '@/messages/t';
import { formatDay } from './format.ts';

// Today's figures as a 2×2 grid of tiles (spec §11.1). Each tile is one
// tap target: a stretched link or button, inside the term, over the whole
// card and named for where it goes; the value stays plain text.

const tileClass =
  'relative rounded-lg bg-card p-4 transition-colors duration-(--dur-fade) has-[a:hover,button:hover]:bg-card-raised';
const stretched =
  'absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function Tile({
  term,
  value,
  action,
}: {
  term: string;
  value: string;
  action: ReactNode;
}) {
  return (
    <div className={tileClass}>
      <dt className="text-label text-text-muted">
        {term}
        {action}
      </dt>
      <dd className="mt-1 font-mono text-title-lg tabular-nums">{value}</dd>
    </div>
  );
}

export function FigureTiles({
  figures,
  locale,
  onExplain,
}: {
  figures: TodayView;
  locale: string;
  onExplain: () => void;
}) {
  return (
    <dl aria-label={t('today.figuresLabel')} className="grid grid-cols-2 gap-3">
      <Tile
        term={t('today.allowance')}
        value={formatMoney(figures.todayAllowance, locale)}
        action={
          <button type="button" className={stretched} onClick={onExplain}>
            <span className="sr-only">{t('today.tiles.allowance')}</span>
          </button>
        }
      />
      <Tile
        term={t('today.spentToday')}
        value={formatMoney(figures.spentToday, locale)}
        action={
          <Link to="/ledger" className={stretched}>
            <span className="sr-only">{t('today.tiles.spentToday')}</span>
          </Link>
        }
      />
      <Tile
        term={t('today.daysLeft')}
        value={String(figures.daysLeft)}
        action={
          <Link to="/cycle" className={stretched}>
            <span className="sr-only">{t('today.tiles.daysLeft')}</span>
          </Link>
        }
      />
      <Tile
        term={t('today.payday')}
        value={
          figures.overdue
            ? t('today.paydayOverdue')
            : formatDay(figures.cycleEnd, locale)
        }
        action={
          <Link to="/settings" hash="payday" className={stretched}>
            <span className="sr-only">{t('today.tiles.payday')}</span>
          </Link>
        }
      />
    </dl>
  );
}
