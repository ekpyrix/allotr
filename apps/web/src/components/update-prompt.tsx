import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { applyUpdate, updateStore } from '@/lib/service-worker';
import { t } from '@/messages/t';

// Offers the new version once its service worker has installed. Reloading
// is the user's choice: an entry being typed is never thrown away. The
// polite live region stays mounted so the offer is announced when it
// appears; it is not a status role, which the save confirmations use.
export function UpdatePrompt() {
  const waiting = useSyncExternalStore(
    updateStore.subscribe,
    updateStore.getSnapshot,
  );
  return (
    <div
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 md:inset-x-auto md:right-4 md:bottom-4 md:w-sm"
    >
      {waiting === null ? null : (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-4 shadow-lg">
          <p className="grow">{t('update.ready')}</p>
          <div className="flex gap-2">
            <Button variant="text" onClick={updateStore.dismiss}>
              {t('update.later')}
            </Button>
            <Button
              onClick={() => {
                applyUpdate(waiting, navigator.serviceWorker, () => {
                  window.location.reload();
                });
              }}
            >
              {t('update.reload')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
