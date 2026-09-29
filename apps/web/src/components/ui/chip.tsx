import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';

// Chips (spec §8.2): 32 px pills with a 48 px hit area. A filter chip
// toggles and shows a check when on; an input chip can be removed; an
// assist chip runs one action.

const base =
  'pressable relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-label outline-none before:absolute before:inset-x-0 before:-inset-y-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';
const off = 'border border-outline text-text hover:bg-card-raised';
const on =
  'border border-transparent bg-primary-container text-on-primary-container';

function FilterChip({
  selected,
  onSelectedChange,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'onChange'> & {
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-slot="filter-chip"
      aria-pressed={selected}
      className={cn(base, selected ? on : off, className)}
      onClick={() => {
        onSelectedChange(!selected);
      }}
      {...props}
    >
      {selected ? <Check aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function AssistChip({
  icon,
  children,
  className,
  ...props
}: React.ComponentProps<'button'> & { icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      data-slot="assist-chip"
      className={cn(base, off, className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

/** A value the user entered, with a button to remove it. */
function InputChip({
  label,
  onRemove,
  className,
}: {
  label: string;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <span
      data-slot="input-chip"
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-outline pl-3 text-label text-text',
        className,
      )}
    >
      {label}
      <button
        type="button"
        aria-label={t('ui.removeChip', { label })}
        onClick={onRemove}
        className="relative flex size-8 items-center justify-center rounded-full outline-none before:absolute before:-inset-2 hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </span>
  );
}

export { AssistChip, FilterChip, InputChip };
