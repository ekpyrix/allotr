import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconArrowDownSLine, IconArrowRightSLine } from '@/generated/icons';
import { FRAME_ORDER, hiddenBelow, rowTemplate } from './row-columns.ts';
import type { RowColumn } from './row-columns.ts';

// One line per row (docs/ui.md §4). Cells are matched to columns by
// position. Hidden columns are removed with `display: none` at the frame
// widths where the template drops them, never wrapped.

function templates(columns: readonly RowColumn[]): CSSProperties {
  return Object.fromEntries(
    FRAME_ORDER.map((frame) => [
      `--cols-${frame}`,
      rowTemplate(columns, frame),
    ]),
  );
}

export type RowProps = {
  columns: readonly RowColumn[];
  cells: readonly ReactNode[];
  selected?: boolean;
  /** Tall lists (transactions) use the 46 px row. */
  tall?: boolean;
  onPress?: () => void;
  className?: string;
};

/** A list row: seams, hover and selection span the full tile width. */
export function Row({
  columns,
  cells,
  selected = false,
  tall = false,
  onPress,
  className,
}: RowProps) {
  const body = (
    <div
      className={cn(
        'row-grid grid items-center gap-x-2 px-3',
        tall ? 'min-h-[2.875rem]' : 'min-h-row',
      )}
      style={templates(columns)}
    >
      {columns.map((column, index) => (
        <div
          key={index}
          className={cn('min-w-0 truncate', hiddenBelow(column.from))}
        >
          {cells[index]}
        </div>
      ))}
    </div>
  );
  const classes = cn(
    'block w-full border-b',
    selected && 'border-l-[3px] border-l-primary bg-card',
    selected && '[&>.row-grid]:pl-[calc(0.75rem-3px)]',
    className,
  );
  if (onPress === undefined) return <div className={classes}>{body}</div>;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPress}
      className={cn(classes, 'press')}
    >
      {body}
    </button>
  );
}

export type TreeRowProps = RowProps & {
  /** `parent` rows fold; `child` rows show a connector. */
  role: 'parent' | 'child' | 'last-child';
  expanded?: boolean;
  onToggle?: () => void;
  label: string;
};

/**
 * A tree row: a 24 px lead column with the fold handle on parents or a
 * `├` / `└` connector on children. Parents are bold. The keyboard model
 * (→ / ← to fold) comes from the React Aria `Tree` the screens wrap rows in.
 */
export function TreeRow({
  role,
  expanded = true,
  onToggle,
  label,
  columns,
  cells,
  ...rest
}: TreeRowProps) {
  const lead =
    role === 'parent' ? (
      <button
        type="button"
        aria-label={label}
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex size-hit items-center justify-center text-text-muted"
      >
        {expanded ? (
          <IconArrowDownSLine className="size-4" />
        ) : (
          <IconArrowRightSLine className="size-4" />
        )}
      </button>
    ) : (
      <span aria-hidden="true" className="block w-6 text-center text-outline">
        {role === 'last-child' ? '└' : '├'}
      </span>
    );
  return (
    <Row
      {...rest}
      columns={[{ width: '1.5rem' }, ...columns]}
      cells={[
        lead,
        ...cells.map((cell, index) =>
          index === 0 && role === 'parent' ? (
            <strong key="name" className="font-semibold">
              {cell}
            </strong>
          ) : (
            cell
          ),
        ),
      ]}
    />
  );
}
