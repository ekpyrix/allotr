import { Link } from '@tanstack/react-router';
import {
  BookOpenText,
  CalendarCheck,
  PiggyBank,
  Plus,
  Settings,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { Fab } from '@/components/ui/fab';
import { useQuickEntry } from '@/features/quick-entry/quick-entry-provider';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import {
  navItems,
  wideNavItems,
  type NavPath,
  type WideNavPath,
} from '@/nav-items';
import { Wordmark } from './wordmark.tsx';

// Navigation by window size class (spec §6, FR-W3): a bottom bar with the
// Add button in its middle below 600 px, a rail from 600 px, and a drawer
// with the wordmark from 1200 px. The active item has an indicator pill
// that grows from the centre and a heavier label, never colour alone. Only
// one of the three is displayed at a time.

const icons: Record<NavPath | WideNavPath, LucideIcon> = {
  '/today': CalendarCheck,
  '/ledger': BookOpenText,
  '/accounts': WalletCards,
  '/settings': Settings,
  '/savings': PiggyBank,
};

// The bottom-bar Add button follows this destination.
const ADD_AFTER: NavPath = '/ledger';

type Item = Readonly<{
  to: NavPath | WideNavPath;
  label: (typeof navItems)[number]['label'] | 'nav.savings';
}>;

function AddFab({ extended = false }: { extended?: boolean }) {
  const { open, shortcutsEnabled } = useQuickEntry();
  const label = t('quickEntry.add');
  return (
    <Fab
      icon={<Plus aria-hidden="true" />}
      {...(extended ? { label } : { 'aria-label': label })}
      aria-keyshortcuts={shortcutsEnabled ? 'n' : undefined}
      onClick={(event) => {
        open(event.currentTarget);
      }}
    />
  );
}

const pill =
  'absolute inset-0 rounded-full bg-primary-container scale-x-0 opacity-0 transition-[scale,opacity] duration-(--dur-smooth) ease-(--ease-smooth) group-aria-[current=page]/nav:scale-x-100 group-aria-[current=page]/nav:opacity-100';

/** A bar or rail item: icon in a 64×32 indicator, label below. */
function StackedItem({ item }: { item: Item }) {
  const Icon = icons[item.to];
  return (
    <Link
      to={item.to}
      activeProps={{ 'aria-current': 'page' }}
      className="group/nav flex min-h-16 flex-col items-center justify-center gap-1 rounded-md px-1 text-label text-text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:font-semibold aria-[current=page]:text-text"
    >
      <span className="relative flex h-8 w-16 items-center justify-center">
        <span aria-hidden="true" className={pill} />
        <Icon
          aria-hidden="true"
          className="relative size-6 stroke-[1.75] group-aria-[current=page]/nav:text-on-primary-container"
        />
      </span>
      {t(item.label)}
    </Link>
  );
}

/** A drawer item: a 56 px pill with icon and label side by side. */
function DrawerItem({ item }: { item: Item }) {
  const Icon = icons[item.to];
  return (
    <Link
      to={item.to}
      activeProps={{ 'aria-current': 'page' }}
      className="group/nav relative flex h-14 items-center gap-3 rounded-full px-4 text-body-lg text-text-muted hover:bg-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:font-semibold aria-[current=page]:text-on-primary-container"
    >
      <span aria-hidden="true" className={pill} />
      <Icon aria-hidden="true" className="relative size-6 stroke-[1.75]" />
      <span className="relative">{t(item.label)}</span>
    </Link>
  );
}

function BottomBar() {
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant bg-chrome pb-[env(safe-area-inset-bottom)] medium:hidden"
    >
      <ul className="grid h-20 grid-flow-col auto-cols-fr items-center px-2">
        {navItems.flatMap((item) => {
          const link = (
            <li key={item.to}>
              <StackedItem item={item} />
            </li>
          );
          // The Add button sits in the middle of the bar, right after the
          // ledger, so it stays in thumb reach.
          return item.to === ADD_AFTER
            ? [
                link,
                <li key="add" className="flex justify-center">
                  <AddFab />
                </li>,
              ]
            : [link];
        })}
      </ul>
    </nav>
  );
}

function Rail() {
  return (
    <nav
      aria-label={t('nav.label')}
      className="sticky top-0 hidden h-dvh w-20 flex-col items-center gap-6 bg-chrome pt-4 medium:flex large:hidden"
    >
      <AddFab />
      <ul className="flex w-full flex-col gap-1 px-2">
        {[...navItems, ...wideNavItems].map((item) => (
          <li key={item.to}>
            <StackedItem item={item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Drawer() {
  return (
    <nav
      aria-label={t('nav.label')}
      className="sticky top-0 hidden h-dvh w-70 flex-col gap-4 bg-chrome px-3 pt-6 large:flex"
    >
      <Wordmark className="px-4 pb-2" />
      <div className="px-1">
        <AddFab extended />
      </div>
      <ul className="flex flex-col gap-1">
        {[...navItems, ...wideNavItems].map((item) => (
          <li key={item.to}>
            <DrawerItem item={item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppNav({ className }: { className?: string }) {
  return (
    <div className={cn('contents', className)}>
      <BottomBar />
      <Rail />
      <Drawer />
    </div>
  );
}
