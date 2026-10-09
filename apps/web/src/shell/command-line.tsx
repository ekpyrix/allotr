import { t } from '@/messages/t';

// Slot: the command line (docs/ui.md §3). Filled by the command-line step.
export function CommandLine() {
  return (
    <section
      aria-label={t('shell.slots.command')}
      data-slot="command"
      className="col-start-1 row-start-4 h-cmd border-t bg-chrome medium:col-start-2"
    />
  );
}
