import { useEffect } from 'react';

/** Tells the sheet around a form while its request runs, so it stays open. */
export function useBusy(busy: boolean, onBusyChange: (busy: boolean) => void) {
  useEffect(() => {
    onBusyChange(busy);
    return () => {
      onBusyChange(false);
    };
  }, [busy, onBusyChange]);
}
