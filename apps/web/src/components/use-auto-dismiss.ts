import { useEffect, useRef } from 'react';

/** Calls `fn` once after `ms`; the returned function cancels it. */
export function scheduleDismiss(ms: number, fn: () => void): () => void {
  const id = setTimeout(fn, ms);
  return () => {
    clearTimeout(id);
  };
}

/** Calls `onDismiss` once after `ms`, unless the component unmounts first. */
export function useAutoDismiss(ms: number, onDismiss: () => void): void {
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  });
  useEffect(
    () =>
      scheduleDismiss(ms, () => {
        latest.current();
      }),
    [ms],
  );
}
