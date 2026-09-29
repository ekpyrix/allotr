import { WifiOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { t } from '@/messages/t';

// Stands in for a view while the device is offline: figures come only
// from the server, so none are shown rather than old ones. A banner says
// so at the top, and a card in the empty-state style holds the page's
// heading.
export function OfflineNotice() {
  return (
    <section aria-labelledby="offline-title" className="grid gap-4 pt-4">
      <p className="rounded-lg bg-warning-container px-4 py-3 text-body">
        {t('offline.banner')}
      </p>
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <span
          aria-hidden="true"
          className="flex size-18 items-center justify-center rounded-full bg-card-raised text-text-muted"
        >
          <WifiOff className="size-8 stroke-[1.75]" />
        </span>
        <h1 id="offline-title" className="text-title-lg">
          {t('offline.title')}
        </h1>
        <p className="max-w-80 text-body text-text-muted">
          {t('offline.intro')}
        </p>
      </Card>
    </section>
  );
}
