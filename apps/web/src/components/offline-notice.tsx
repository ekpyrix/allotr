import { WifiOff } from 'lucide-react';
import { t } from '@/messages/t';

// Stands in for a view while the device is offline: figures come only
// from the server, so none are shown rather than old ones.
export function OfflineNotice() {
  return (
    <section aria-labelledby="offline-title" className="max-w-prose">
      <WifiOff aria-hidden="true" className="size-8 text-muted-foreground" />
      <h1
        id="offline-title"
        className="mt-4 text-3xl font-semibold tracking-tight"
      >
        {t('offline.title')}
      </h1>
      <p className="mt-3 text-muted-foreground">{t('offline.intro')}</p>
    </section>
  );
}
