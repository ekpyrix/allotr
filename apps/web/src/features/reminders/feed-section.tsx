import type { ReminderView } from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellDot } from 'lucide-react';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { formatMoment } from '@/features/ledger/format';
import { Section } from '@/features/settings/section';
import { errorMessage } from '@/lib/problem';
import { markRead, remindersQuery } from '@/lib/reminders';
import { t } from '@/messages/t';
import { PushDevice } from './push-device.tsx';

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: readonly string[]) => markRead(ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

/** The path a reminder opens, split for the router. */
export function reminderTarget(url: string): { to: string; hash?: string } {
  const [path = '/', hash] = url.split('#');
  return hash === undefined ? { to: path } : { to: path, hash };
}

function Item({
  reminder,
  locale,
  timeZone,
}: {
  reminder: ReminderView;
  locale: string;
  timeZone: string;
}) {
  const unread = reminder.readAt === null;
  return (
    <li
      data-testid="reminder"
      className="grid gap-1 border-b border-outline-variant px-4 py-3 last:border-b-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-body font-medium">{reminder.title}</h4>
        {unread ? (
          <StatusChip tone="info" icon={<BellDot aria-hidden="true" />}>
            {t('reminders.feed.new')}
          </StatusChip>
        ) : null}
      </div>
      <p className="text-body">{reminder.body}</p>
      <p className="text-caption text-text-muted">
        {formatMoment(reminder.createdAt, locale, timeZone)}
        {' · '}
        <a
          href={reminder.url}
          className="font-medium underline underline-offset-4"
        >
          {t('reminders.feed.open')}
        </a>
      </p>
    </li>
  );
}

/** The reminder feed and this device's push switch, under App settings. */
export function RemindersSection({
  locale,
  timeZone,
}: {
  locale: string;
  timeZone: string;
}) {
  const feed = useQuery(remindersQuery);
  const read = useMarkRead();
  return (
    <Section
      id="reminders"
      title={t('reminders.title')}
      intro={t('reminders.intro')}
    >
      {feed.data === undefined ? (
        <p role="status" className="mt-3 text-text-muted">
          {feed.isError ? t('errors.network') : t('reminders.loading')}
        </p>
      ) : feed.data.reminders.length === 0 ? (
        <p className="mt-3 text-body text-text-muted">
          {t('reminders.feed.empty')}
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-body" data-testid="reminders-unread">
              {t('reminders.feed.unread', { count: feed.data.unread })}
            </p>
            <Button
              variant="outlined"
              size="dense"
              disabled={feed.data.unread === 0 || read.isPending}
              onClick={() => {
                read.mutate(undefined);
              }}
            >
              {t('reminders.feed.markAll')}
            </Button>
          </div>
          <ul className="mt-2 border-y border-outline-variant">
            {feed.data.reminders.map((reminder) => (
              <Item
                key={reminder.id}
                reminder={reminder}
                locale={locale}
                timeZone={timeZone}
              />
            ))}
          </ul>
        </>
      )}
      <FormError message={read.isError ? errorMessage(read.error) : null} />
      <div className="mt-6">
        <PushDevice />
      </div>
    </Section>
  );
}
