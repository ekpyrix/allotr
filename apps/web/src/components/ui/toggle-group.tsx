import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// Toggle group (ADR 0022): joined equal segments in a hairline outline, one
// always on, replacing the pill segmented selector. The selected segment is
// filled with the primary container; the change is a colour transition on
// the snappy spring, with no sliding pill. Radix gives radio semantics.

type Option<V extends string> = Readonly<{ value: V; label: React.ReactNode }>;

function ToggleGroup<V extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly Option<V>[];
  /** The group's accessible name. */
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        // Radix clears the value when the selected item is pressed again.
        if (next !== '') onValueChange(next as V);
      }}
      className={cn(
        'grid auto-cols-fr grid-flow-col overflow-hidden rounded-md border border-outline',
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className="flex h-10 min-w-0 items-center justify-center border-l border-outline px-3 text-label text-text transition-colors duration-(--dur-snappy) ease-(--ease-snappy) first:border-l-0 hover:bg-card-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=on]:bg-primary-container data-[state=on]:text-on-primary-container"
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

export { ToggleGroup };
