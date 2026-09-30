import * as React from 'react';
import { X } from 'lucide-react';
import { t } from '@/messages/t';
import { createCountdown, snackDuration } from './snackbar-timer.ts';

// Snackbar (spec §8.2, §7.3): one message at a time on the inverse
// surface, with at most one action. A new message replaces the current
// one. Messages are announced through live regions that are always in the
// page (polite, or assertive for an error). They carry aria-live without
// a status or alert role, so they never compete with a screen's own
// status and alert messages; the visible bar with its buttons is never
// itself a live region. It pauses while hovered or
// focused and rises in with the smooth spring.

export type Snack = Readonly<{
  message: string;
  action?: Readonly<{ label: string; onAction: () => void }>;
  /** `error` is announced assertively. */
  tone?: 'status' | 'error';
}>;

type Shown = Snack & { id: number };

const SnackbarContext = React.createContext<((snack: Snack) => void) | null>(
  null,
);

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = React.useState<Shown | null>(null);
  const next = React.useRef(0);
  const show = React.useCallback((snack: Snack) => {
    next.current += 1;
    setShown({ ...snack, id: next.current });
  }, []);
  const done = React.useCallback(() => {
    setShown(null);
  }, []);
  return (
    <SnackbarContext value={show}>
      {children}
      <SnackbarHost shown={shown} onDone={done} />
    </SnackbarContext>
  );
}

export function useSnackbar(): (snack: Snack) => void {
  const show = React.use(SnackbarContext);
  if (show === null) throw new Error('useSnackbar needs a SnackbarProvider');
  return show;
}

function SnackbarHost({
  shown,
  onDone,
}: {
  shown: Shown | null;
  onDone: () => void;
}) {
  const countdown = React.useRef<ReturnType<typeof createCountdown> | null>(
    null,
  );
  React.useEffect(() => {
    if (shown === null) return;
    const timer = createCountdown(
      snackDuration(shown.action !== undefined),
      onDone,
    );
    countdown.current = timer;
    return () => {
      timer.cancel();
    };
  }, [shown, onDone]);

  const pause = () => countdown.current?.pause();
  const resume = () => countdown.current?.resume();

  const error = shown?.tone === 'error';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 medium:bottom-6">
      <p aria-live="polite" data-slot="snackbar-status" className="sr-only">
        {shown !== null && !error ? shown.message : ''}
      </p>
      <p aria-live="assertive" data-slot="snackbar-alert" className="sr-only">
        {shown !== null && error ? shown.message : ''}
      </p>
      {shown === null ? null : (
        <div
          key={shown.id}
          onMouseEnter={pause}
          onMouseLeave={resume}
          onFocus={pause}
          onBlur={resume}
          className="pointer-events-auto flex min-h-12 w-full max-w-[560px] items-center gap-2 rounded-md bg-inverse py-1 pr-1 pl-4 text-body text-on-inverse rise-in"
        >
          <p className="flex-1 py-2">{shown.message}</p>
          {shown.action === undefined ? null : (
            <button
              type="button"
              onClick={() => {
                shown.action?.onAction();
                onDone();
              }}
              className="h-10 shrink-0 rounded-full px-3 text-[0.9375rem] font-semibold text-on-inverse underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-inverse"
            >
              {shown.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label={t('ui.dismiss')}
            onClick={onDone}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-on-inverse focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-inverse"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
