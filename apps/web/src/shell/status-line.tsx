import { t } from '@/messages/t';

// Slot: the status line, shown from 600 px (docs/ui.md §3).
export function StatusLine() {
  return (
    <footer
      aria-label={t('shell.slots.status')}
      data-slot="status"
      className="hidden h-bar items-center border-t bg-chrome px-3 text-small medium:col-span-full medium:row-start-5 medium:flex"
    />
  );
}
