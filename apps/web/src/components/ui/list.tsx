import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Grouped lists (spec §8.2): a card holding rows, with dividers inset past
// the leading icon. Rows are 56 px for one line, 72 for two, and trailing
// figures are right-aligned mono. A row that does something is a button or
// a link, and steps up a tier on hover and press (no scale: rows only get
// the tonal state).

function List({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="list"
      className={cn('overflow-hidden rounded-lg bg-card', className)}
      {...props}
    />
  );
}

type RowContent = {
  /** A Lucide icon or similar; it gets the 40 px tonal container. */
  leading?: React.ReactNode;
  title: React.ReactNode;
  supporting?: React.ReactNode;
  /** Usually a figure; rendered in mono, right-aligned. */
  trailing?: React.ReactNode;
};

function RowBody({
  leading,
  title,
  supporting,
  trailing,
  chevron,
}: RowContent & { chevron: boolean }) {
  return (
    <>
      {leading === undefined ? null : (
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-card-raised text-text [&_svg]:size-5 [&_svg]:stroke-[1.75]"
        >
          {leading}
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center gap-3 self-stretch border-b border-outline-variant py-2 group-last/row:border-b-0">
        <span className="min-w-0 flex-1">
          <span className="block text-body-lg wrap-anywhere">{title}</span>
          {supporting === undefined ? null : (
            <span className="block text-body text-text-muted wrap-anywhere">
              {supporting}
            </span>
          )}
        </span>
        {trailing === undefined ? null : (
          <span className="shrink-0 text-right font-mono text-body-lg">
            {trailing}
          </span>
        )}
        {chevron ? (
          <ChevronRight
            aria-hidden="true"
            className="size-5 shrink-0 text-text-muted"
          />
        ) : null}
      </span>
    </>
  );
}

const rowClass =
  'flex min-h-(--row-h) w-full items-center gap-4 pl-4 pr-4 text-left';

/** A row that only shows something. */
function ListRow({
  className,
  ...content
}: RowContent & { className?: string }) {
  return (
    <li data-slot="list-row" className={cn('group/row', className)}>
      <div className={rowClass}>
        <RowBody {...content} chevron={false} />
      </div>
    </li>
  );
}

/**
 * A row that opens or does something. Pass `asChild` content (a Link) via
 * `render`, or an `onClick` for a button.
 */
function ListRowButton({
  className,
  onClick,
  render,
  ...content
}: RowContent & {
  className?: string;
  onClick?: () => void;
  /** Renders the row as another element, e.g. a router Link. */
  render?: (props: {
    className: string;
    children: React.ReactNode;
  }) => React.ReactNode;
}) {
  const interactive = cn(
    rowClass,
    ' transition-colors duration-(--dur-fade) hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring active:bg-card-raised',
  );
  const children = <RowBody {...content} chevron />;
  return (
    <li data-slot="list-row" className={cn('group/row', className)}>
      {render === undefined ? (
        <button type="button" className={interactive} onClick={onClick}>
          {children}
        </button>
      ) : (
        render({ className: interactive, children })
      )}
    </li>
  );
}

export { List, ListRow, ListRowButton };
