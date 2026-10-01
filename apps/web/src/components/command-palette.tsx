import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import {
  BookOpenText,
  CalendarRange,
  History,
  LayoutDashboard,
  Palette,
  PieChart,
  PiggyBank,
  Plus,
  Search,
  Settings,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { useQuickEntry } from '@/features/quick-entry/quick-entry-provider';
import { isPaletteShortcut } from '@/lib/shortcuts';
import { t } from '@/messages/t';

// The command palette (spec §8.2, §9.1): ⌘K, Ctrl+K or `/` opens it, when
// single-key shortcuts are on (the same setting as quick entry's `n`). It
// jumps to a view, starts a new entry, or searches entries by note in the
// ledger. The natural-language grammar comes to it with the grammar (M3);
// until then "New entry" hands off to quick entry.

type Destination = Readonly<{
  label: string;
  icon: LucideIcon;
  to:
    | '/'
    | '/transactions'
    | '/accounts'
    | '/budget'
    | '/reports'
    | '/reports/history'
    | '/accounts/savings'
    | '/settings';
  hash?: string;
}>;

function destinations(): Destination[] {
  return [
    { label: t('nav.dashboard'), icon: LayoutDashboard, to: '/' },
    { label: t('nav.transactions'), icon: BookOpenText, to: '/transactions' },
    { label: t('nav.accounts'), icon: WalletCards, to: '/accounts' },
    { label: t('nav.budget'), icon: PieChart, to: '/budget' },
    { label: t('nav.reports'), icon: CalendarRange, to: '/reports' },
    { label: t('palette.history'), icon: History, to: '/reports/history' },
    { label: t('nav.savings'), icon: PiggyBank, to: '/accounts/savings' },
    { label: t('nav.settings'), icon: Settings, to: '/settings' },
    {
      label: t('palette.appearance'),
      icon: Palette,
      to: '/settings',
      hash: 'appearance',
    },
  ];
}

const itemClass =
  'flex min-h-12 cursor-pointer items-center gap-3 rounded-sm px-3 text-body-lg text-text select-none data-[selected=true]:bg-card [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:stroke-[1.75] [&_svg]:text-text-muted';
const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:text-text-muted';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // What had focus when it opened: focus goes back there, and quick entry
  // started from here returns focus there too.
  const opener = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const quickEntry = useQuickEntry();
  const enabled = quickEntry.shortcutsEnabled;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        !isPaletteShortcut(
          {
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey,
            repeat: event.repeat,
            isComposing: event.isComposing,
            target,
          },
          enabled,
        )
      )
        return;
      event.preventDefault();
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setQuery('');
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const trimmed = query.trim();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:scrim-in dark:bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-2xl border border-outline-variant bg-card-raised text-text data-[state=open]:overlay-in"
        >
          <Dialog.Title className="sr-only">{t('palette.label')}</Dialog.Title>
          <Command label={t('palette.label')} loop>
            <div className="flex items-center gap-3 border-b-2 border-outline-variant px-4 focus-within:border-primary">
              <Search aria-hidden className="size-5 shrink-0 text-text-muted" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t('palette.placeholder')}
                className="h-14 w-full bg-transparent text-base text-text placeholder:text-text-muted focus-visible:outline-none"
              />
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-body text-text-muted">
                {t('palette.empty')}
              </Command.Empty>
              <Command.Group heading={t('palette.go')} className={groupClass}>
                {destinations().map((destination) => (
                  <Command.Item
                    key={destination.label}
                    value={destination.label}
                    className={itemClass}
                    onSelect={() => {
                      run(() => {
                        void navigate({
                          to: destination.to,
                          ...(destination.hash === undefined
                            ? {}
                            : { hash: destination.hash }),
                        });
                      });
                    }}
                  >
                    <destination.icon aria-hidden />
                    {destination.label}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group
                heading={t('palette.actions')}
                className={groupClass}
              >
                <Command.Item
                  value={t('palette.newEntry')}
                  className={itemClass}
                  onSelect={() => {
                    run(() => {
                      quickEntry.open(opener.current ?? undefined);
                    });
                  }}
                >
                  <Plus aria-hidden />
                  {t('palette.newEntry')}
                </Command.Item>
              </Command.Group>
              {trimmed === '' ? null : (
                <Command.Group
                  heading={t('palette.searchGroup')}
                  forceMount
                  className={groupClass}
                >
                  <Command.Item
                    // A fixed value scores nothing, so matching destinations
                    // rank above it; forceMount keeps it listed.
                    value="search-entries"
                    forceMount
                    className={itemClass}
                    onSelect={() => {
                      run(() => {
                        void navigate({
                          to: '/transactions',
                          search: { q: trimmed },
                        });
                      });
                    }}
                  >
                    <Search aria-hidden />
                    {t('palette.search', { query: trimmed })}
                  </Command.Item>
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
