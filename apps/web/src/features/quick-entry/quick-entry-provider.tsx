import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  isQuickEntryShortcut,
  readShortcutsEnabled,
  saveShortcutsEnabled,
} from '@/lib/shortcuts';
import { QuickEntryDialog } from './quick-entry-dialog.tsx';

interface QuickEntryContextValue {
  open: () => void;
  shortcutsEnabled: boolean;
  setShortcutsEnabled: (enabled: boolean) => void;
}

const QuickEntryContext = createContext<QuickEntryContextValue | null>(null);

export function useQuickEntry(): QuickEntryContextValue {
  const value = use(QuickEntryContext);
  if (value === null)
    throw new Error('useQuickEntry needs a QuickEntryProvider');
  return value;
}

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const SAVED_MESSAGE_MS = 6000;

// Lives in the app shell, so the form opens from every signed-in view.
export function QuickEntryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const [saved, setSaved] = useState('');
  // Shown once the dialog is gone: while it is open everything behind it is
  // aria-hidden, so text set then would not be announced.
  const pendingSaved = useRef('');
  const [shortcutsEnabled, setEnabled] = useState(() =>
    readShortcutsEnabled(storage()),
  );

  // Radix only returns focus to its own trigger, and this dialog has none:
  // remember what had focus and give it back on close.
  const show = useCallback(() => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    pendingSaved.current = '';
    setSaved('');
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!shortcutsEnabled || isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        !isQuickEntryShortcut(
          {
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey,
            repeat: event.repeat,
            isComposing: event.isComposing,
            target,
          },
          shortcutsEnabled,
        )
      )
        return;
      event.preventDefault();
      show();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shortcutsEnabled, isOpen, show]);

  useEffect(() => {
    if (saved === '') return;
    const timer = setTimeout(() => {
      setSaved('');
    }, SAVED_MESSAGE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [saved]);

  const value = useMemo<QuickEntryContextValue>(
    () => ({
      open: show,
      shortcutsEnabled,
      setShortcutsEnabled: (enabled) => {
        saveShortcutsEnabled(storage(), enabled);
        setEnabled(enabled);
      },
    }),
    [shortcutsEnabled, show],
  );

  return (
    <QuickEntryContext value={value}>
      {children}
      <QuickEntryDialog
        open={isOpen}
        onOpenChange={setOpen}
        onSaved={(message) => {
          pendingSaved.current = message;
        }}
        onCloseAutoFocus={() => {
          opener.current?.focus();
          setSaved(pendingSaved.current);
          pendingSaved.current = '';
        }}
      />
      {/* Always in the DOM so screen readers hear the change. */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-20 flex justify-center md:inset-x-auto md:right-6 md:bottom-6"
      >
        {saved === '' ? null : (
          <p className="rounded-md bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg">
            {saved}
          </p>
        )}
      </div>
    </QuickEntryContext>
  );
}
