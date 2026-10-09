// The seam for the `f` shortcut: the Transactions screen subscribes with
// `onFilterMenuRequest` and opens its filter menu; the shortcut hook calls
// `requestFilterMenu` only on /transactions. Nothing listens until that
// screen lands.

const EVENT = 'allotr:open-filter-menu';

export function requestFilterMenu(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** Subscribes to the request; returns an unsubscribe. */
export function onFilterMenuRequest(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  return () => {
    window.removeEventListener(EVENT, handler);
  };
}
