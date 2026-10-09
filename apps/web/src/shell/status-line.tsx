import { daysBetween } from '@allotr/shared';
import { useIsFetching, useQuery } from '@tanstack/react-query';
import { formatDay } from '@/features/today/format';
import { todayQuery } from '@/lib/ledger';
import { useOnline } from '@/lib/online';
import { t } from '@/messages/t';

// The status line, from 600 px (docs/ui.md §3): mode block, cycle day,
// payday, currency, key hints and sync state. Days are dates, not money, so
// the cycle day is counted here from the server's dates.

export function StatusLine() {
  const today = useQuery(todayQuery).data;
  const online = useOnline();
  const fetching = useIsFetching() > 0;
  const sync = !online ? 'offline' : fetching ? 'syncing' : 'synced';
  return (
    <footer
      aria-label={t('shell.slots.status')}
      data-slot="status"
      className="hidden h-bar items-center gap-3 border-t bg-chrome pr-3 text-small medium:col-span-full medium:row-start-5 medium:flex"
    >
      <span className="flex h-full items-center bg-primary px-3 font-semibold text-on-primary">
        {t('shell.status.mode')}
      </span>
      {today === undefined ? null : (
        <>
          <span>
            {t('shell.status.cycleDay', {
              day: daysBetween(today.cycle.openedOn, today.today) + 1,
            })}
          </span>
          <span>
            {t('shell.status.payday', {
              date: formatDay(today.cycleEnd, 'en'),
            })}
          </span>
          <span>{today.onBudget.currency}</span>
        </>
      )}
      <span className="hidden min-w-0 flex-1 truncate text-text-muted wide:inline">
        {t('shell.status.keys')}
      </span>
      <span role="status" className="ml-auto flex items-center gap-1">
        <span
          aria-hidden="true"
          className={sync === 'synced' ? 'text-positive' : 'text-text-muted'}
        >
          ●
        </span>
        {t(`shell.status.${sync}`)}
      </span>
    </footer>
  );
}
