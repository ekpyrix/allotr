import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { remindersQuery } from '@/lib/reminders';
import { t } from '@/messages/t';
import { useMarkRead } from './feed-section.tsx';

/** Unread reminders on the Dashboard; nothing when there are none. */
export function ReminderCard() {
  const heading = useId();
  const feed = useQuery(remindersQuery);
  const read = useMarkRead();
  const unread = feed.data?.reminders.filter((r) => r.readAt === null) ?? [];
  if (unread.length === 0) return null;
  return (
    <section aria-labelledby={heading}>
      <h2 id={heading} className="text-title">
        {t('reminders.card.title')}
      </h2>
      <Card className="mt-3 grid gap-3">
        <ul className="grid gap-2">
          {unread.slice(0, 3).map((reminder) => (
            <li key={reminder.id} className="grid gap-0.5 text-body">
              <a
                href={reminder.url}
                className="w-fit font-medium underline underline-offset-4"
              >
                {reminder.title}
              </a>
              <span className="text-text-muted">{reminder.body}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outlined"
            size="dense"
            disabled={read.isPending}
            onClick={() => {
              read.mutate(undefined);
            }}
          >
            {t('reminders.feed.markAll')}
          </Button>
          <Link
            to="/settings"
            hash="reminders"
            className="font-medium underline underline-offset-4"
          >
            {t('reminders.card.all', { count: feed.data?.unread ?? 0 })}
          </Link>
        </div>
      </Card>
    </section>
  );
}
