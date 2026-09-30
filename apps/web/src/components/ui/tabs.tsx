import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// Primary tabs (spec §8.2): equal-width tabs with a 3 px pill indicator
// under the active label that slides with the snappy spring. Equal widths
// let the indicator move by transform alone.

type Tab<V extends string> = Readonly<{ value: V; label: React.ReactNode }>;

function Tabs<V extends string>({
  value,
  onValueChange,
  tabs,
  label,
  children,
  className,
}: {
  value: V;
  onValueChange: (value: V) => void;
  tabs: readonly Tab<V>[];
  /** The tab list's accessible name. */
  label: string;
  /** TabsPanel elements, one per tab. */
  children: React.ReactNode;
  className?: string;
}) {
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.value === value),
  );
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(next) => {
        onValueChange(next as V);
      }}
      className={className}
    >
      <TabsPrimitive.List
        aria-label={label}
        className="relative grid auto-cols-fr grid-flow-col border-b border-outline-variant"
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className="flex h-12 min-w-0 items-center justify-center px-3 text-label text-text-muted transition-colors duration-(--dur-fade) hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring data-[state=active]:text-text"
          >
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 flex h-[3px] justify-center transition-transform duration-(--dur-snappy) ease-(--ease-snappy)"
          style={{
            width: `${String(100 / tabs.length)}%`,
            transform: `translateX(${String(index * 100)}%)`,
          }}
        >
          <span className="h-full w-12 rounded-t-full bg-primary" />
        </span>
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

function TabsPanel({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'pt-4 focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsPanel };
