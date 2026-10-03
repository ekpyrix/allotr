import { Link } from '@tanstack/react-router';
import {
  BookOpenText,
  LayoutDashboard,
  PieChart,
  Plus,
  Settings,
  ChartNoAxesColumn,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { Fab } from '@/components/ui/fab';
import { useQuickEntry } from '@/features/quick-entry/quick-entry-provider';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { navItems, settingsItem, type NavPath } from '@/nav-items';
import { Wordmark } from './wordmark.tsx';

// Navigation by window size (ADR 0023): below 600 px a floating tab bar, a
// flat pill with the five destinations, and a separate round Add button
// beside it on every tab; from 600 px an ordinary sidebar with Add at the
// top and Settings at the foot. The active destination is shown by a tonal
// fill and a heavier label, never colour alone. Switching is instant; only
// press feedback animates.

const icons: Record<NavPath | '/settings', LucideIcon> = {
  '/': LayoutDashboard,
  '/accounts': WalletCards,
  '/transactions': BookOpenText,
  '/budget': PieChart,
  '/reports': ChartNoAxesColumn,
  '/settings': Settings,
};

function AddButton({ extended = false }: { extended?: boolean }) {
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
      className={extended ? 'w-full' : 'shadow-none'}
    />
  );
}

const exact = (to: string) => ({ exact: to === '/' });

/** A tab in the floating bar: icon over a short label. */
function Tab({ to, label }: { to: NavPath; label: string }) {
  const Icon = icons[to];
  return (
    <Link
      to={to}
      activeOptions={exact(to)}
      activeProps={{ 'aria-current': 'page' }}
      className="pressable flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-caption text-text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-primary-container aria-[current=page]:font-semibold aria-[current=page]:text-on-primary-container"
    >
      <Icon aria-hidden="true" className="size-5 stroke-[1.75]" />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

function TabBar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] medium:hidden">
      <nav
        aria-label={t('nav.label')}
        className="pointer-events-auto min-w-0 flex-1 rounded-full border border-outline-variant bg-card-raised p-1"
      >
        <ul className="flex items-center">
          {navItems.map((item) => (
            <li key={item.to} className="flex min-w-0 flex-1">
              <Tab to={item.to} label={t(item.label)} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="pointer-events-auto">
        <AddButton />
      </div>
    </div>
  );
}

function SidebarLink({
  to,
  label,
}: {
  to: NavPath | '/settings';
  label: string;
}) {
  const Icon = icons[to];
  return (
    <Link
      to={to}
      activeOptions={exact(to)}
      activeProps={{ 'aria-current': 'page' }}
      className="flex h-10 items-center gap-3 rounded-md px-3 text-body text-text-muted hover:bg-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:text-text"
    >
      <Icon aria-hidden="true" className="size-5 stroke-[1.75]" />
      {label}
    </Link>
  );
}

function Sidebar() {
  return (
    <nav
      aria-label={t('nav.label')}
      className="sticky top-0 hidden h-dvh w-56 flex-col gap-4 border-r border-outline-variant px-3 pt-5 pb-4 medium:flex"
    >
      <Wordmark className="px-3 pb-1" />
      <AddButton extended />
      <ul className="flex flex-1 flex-col gap-0.5">
        {navItems.map((item) => (
          <li key={item.to}>
            <SidebarLink to={item.to} label={t(item.label)} />
          </li>
        ))}
      </ul>
      <SidebarLink to={settingsItem.to} label={t(settingsItem.label)} />
    </nav>
  );
}

export function AppNav({ className }: { className?: string }) {
  return (
    <div className={cn('contents', className)}>
      <TabBar />
      <Sidebar />
    </div>
  );
}
