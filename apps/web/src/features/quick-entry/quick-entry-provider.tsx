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
import { formatMoney } from '@allotr/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from '@/components/ui/snackbar';
import { ApiError } from '@/lib/api';
import {
  entryQueryKeys,
  ledgerSettingsQuery,
  restoreTransaction,
  reverseTransaction,
  todayQuery,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import {
  isQuickEntryShortcut,
  readShortcutsEnabled,
  saveShortcutsEnabled,
} from '@/lib/shortcuts';
import { t } from '@/messages/t';
import { haptic } from '@/motion/haptics';
import {
  QuickEntryDialog,
  type QuickEntryPreset,
} from './quick-entry-dialog.tsx';

interface QuickEntryContextValue {
  /** Pass the element that was clicked: Safari does not focus buttons. */
  open: (opener?: HTMLElement, preset?: QuickEntryPreset) => void;
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
  const [preset, setPreset] = useState<QuickEntryPreset | undefined>();
  const opener = useRef<HTMLElement | null>(null);
  // Off when the dialog closes to navigate: the new view has focus by then.
  const restoreFocus = useRef(true);
  const [saved, setSaved] = useState('');
  // Shown once the dialog is gone: while it is open everything behind it is
  // aria-hidden, so text set then would not be announced.
  const pendingSaved = useRef<{ message: string; id: string } | null>(null);
  const queryClient = useQueryClient();
  const snack = useSnackbar();
  const [shortcutsEnabled, setEnabled] = useState(() =>
    readShortcutsEnabled(storage()),
  );

  // Radix only returns focus to its own trigger, and this dialog has none:
  // remember the opener (or what had focus) and give focus back on close.
  const show = useCallback((from?: HTMLElement, start?: QuickEntryPreset) => {
    setPreset(start);
    opener.current =
      from ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    restoreFocus.current = true;
    pendingSaved.current = null;
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

  const failed = useCallback(
    (error: unknown) => {
      const message = errorMessage(error);
      setSaved(message);
      snack({ message, tone: 'error', silent: true });
      haptic('error');
    },
    [snack],
  );
  const refresh = useCallback(
    () =>
      Promise.all(
        entryQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    [queryClient],
  );

  // Undo on a new entry deletes it: a reversal is posted (spec §9.3) and
  // the entry leaves every list. Undo again brings it back as a copy.
  const restore = useCallback(
    async (id: string) => {
      try {
        await restoreTransaction(id);
      } catch (error) {
        if (!(
          error instanceof ApiError && error.problem.code === 'already_restored'
        )) {
          failed(error);
          return;
        }
      }
      await refresh();
      setSaved(t('quickEntry.restored'));
      snack({ message: t('quickEntry.restored'), silent: true });
    },
    [failed, refresh, snack],
  );
  const undo = useCallback(
    async (id: string) => {
      try {
        await reverseTransaction(id);
      } catch (error) {
        if (!(
          error instanceof ApiError && error.problem.code === 'already_reversed'
        )) {
          failed(error);
          return;
        }
      }
      await refresh();
      setSaved(t('quickEntry.undone'));
      snack({
        message: t('quickEntry.undone'),
        silent: true,
        action: {
          label: t('quickEntry.undo'),
          onAction: () => {
            void restore(id);
          },
        },
      });
    },
    [failed, refresh, restore, snack],
  );

  // Says what was saved and what is left today, from the refreshed
  // figures, with Undo beside it.
  const announce = useCallback(
    async (entry: { message: string; id: string }) => {
      let message = entry.message;
      try {
        const [today, settings] = await Promise.all([
          queryClient.query({ ...todayQuery, staleTime: 0 }),
          queryClient.query(ledgerSettingsQuery),
        ]);
        message = t('quickEntry.savedLeft', {
          saved: entry.message,
          amount: formatMoney(today.leftToday, settings.locale),
        });
      } catch {
        // Offline or failing: the saved message alone still holds.
      }
      haptic('save');
      setSaved(message);
      snack({
        message,
        silent: true,
        action: {
          label: t('quickEntry.undo'),
          onAction: () => {
            void undo(entry.id);
          },
        },
      });
    },
    [queryClient, snack, undo],
  );

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
        preset={preset}
        onOpenChange={setOpen}
        onSaved={(message, id) => {
          pendingSaved.current = { message, id };
        }}
        onNavigate={() => {
          restoreFocus.current = false;
        }}
        onCloseAutoFocus={() => {
          if (restoreFocus.current) opener.current?.focus();
          const entry = pendingSaved.current;
          pendingSaved.current = null;
          if (entry !== null) void announce(entry);
        }}
      />
      {/* Always in the DOM so screen readers hear the change; the snackbar
          shows it with Undo. */}
      <p role="status" className="sr-only">
        {saved}
      </p>
    </QuickEntryContext>
  );
}
