import { t } from '@/messages/t';

// Slot: the summary bar (docs/ui.md §3). Filled by the summary-bar step.
export function SummaryBar() {
  return (
    <section
      aria-label={t('shell.slots.summary')}
      data-slot="summary"
      className="min-h-bar border-b bg-canvas medium:col-start-2 medium:row-start-1"
    />
  );
}
