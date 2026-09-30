import * as React from 'react';
import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

// Segmented control (spec §8.2): equal segments in an outlined pill track.
// The selected pill is primary (3:1 against the page) and slides between
// segments with the snappy spring. One option is always selected.

type Option<V extends string> = Readonly<{ value: V; label: React.ReactNode }>;

function Segmented<V extends string>({
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
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        // Radix clears the value when the selected item is pressed again.
        if (next !== '') onValueChange(next as V);
      }}
      className={cn(
        // `isolate` keeps the labels' z-index inside the control, so they
        // never paint over the sticky top app bar.
        'relative isolate grid auto-cols-fr grid-flow-col rounded-full border border-outline p-1',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-primary transition-transform duration-(--dur-snappy) ease-(--ease-snappy)"
        style={{
          width: `calc((100% - 0.5rem) / ${String(options.length)})`,
          transform: `translateX(${String(index * 100)}%)`,
        }}
      />
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className="relative z-10 flex h-10 min-w-0 items-center justify-center rounded-full px-3 text-label text-text transition-colors duration-(--dur-fade) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=on]:text-on-primary"
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export { Segmented };
