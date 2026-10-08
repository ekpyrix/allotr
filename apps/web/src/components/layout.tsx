import type { ComponentType, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { IconProps } from '@/generated/icons';
import { FrameWidthContext } from './use-frame-width.ts';

// Tiles run edge to edge (docs/ui.md §4). Seams come from each tile's own
// right and bottom 1 px border and the grid's top and left one, so adjacent
// tiles share a single line and an empty cell shows `canvas`.

/** The app frame: the container the responsive variants query. */
export function Frame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <FrameWidthContext value={width}>
      <div ref={ref} className={cn('frame bg-canvas text-text', className)}>
        <div className="scale">{children}</div>
      </div>
    </FrameWidthContext>
  );
}

/** A grid of tiles: 1 column below 720, 2 from 720, 3 from 1100, 4 from 1500. */
export function Grid({
  columns = 'auto',
  className,
  children,
}: {
  /** `auto` follows the frame; a number pins it (the 0029 setting, later). */
  columns?: 'auto' | 1 | 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid grid-flow-dense auto-rows-auto border-t border-l bg-canvas',
        columns === 'auto' &&
          'grid-cols-1 cols2:grid-cols-2 cols3:grid-cols-3 cols4:grid-cols-4',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        columns === 4 && 'grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A vertical stack of tiles; the last child grows. */
export function Stack({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col border-t border-l bg-canvas [&>:last-child]:flex-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A list and its detail side by side from 1000 px; the list alone below. */
export function Split({
  list,
  detail,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 border-t border-l bg-canvas wide:grid-cols-[minmax(0,1fr)_25rem]',
        className,
      )}
    >
      <div className="min-w-0">{list}</div>
      <div className="min-w-0 narrow:hidden">{detail}</div>
    </div>
  );
}

export type TileProps = {
  title: string;
  subtitle?: string | undefined;
  icon?: ComponentType<IconProps> | undefined;
  /** Controls on the right of the title bar. */
  actions?: ReactNode;
  /** A focused or primary tile gets a 3 px `primary` edge on its title bar. */
  primary?: boolean;
  /** Columns the tile spans in a Grid. */
  span?: 1 | 2 | 'full';
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
};

/** A tile (`pane`): a title bar on `chrome`, then its content on `canvas`. */
export function Tile({
  title,
  subtitle,
  icon,
  actions,
  primary = false,
  span = 1,
  className,
  bodyClassName,
  children,
}: TileProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 flex-col border-r border-b bg-canvas',
        span === 2 && 'cols2:col-span-2',
        span === 'full' && 'col-span-full',
        className,
      )}
    >
      <TitleBar
        id={id}
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={actions}
        primary={primary}
      />
      <div className={cn('flex-1 px-3 pb-2.5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** The tile title bar: icon, title, muted subtitle, actions on the right. */
export function TitleBar({
  id,
  title,
  subtitle,
  icon: Icon,
  actions,
  primary = false,
}: Pick<TileProps, 'title' | 'subtitle' | 'icon' | 'actions' | 'primary'> & {
  id?: string;
}) {
  return (
    <header
      className={cn(
        'flex h-bar min-w-0 items-center gap-2 border-b bg-chrome px-3',
        primary && 'border-l-[3px] border-l-primary pl-[calc(0.75rem-3px)]',
      )}
    >
      {Icon === undefined ? null : (
        <Icon className="size-4 shrink-0 text-text-muted" />
      )}
      <h2 id={id} className="min-w-0 shrink-0 truncate text-base font-semibold">
        {title}
      </h2>
      {subtitle === undefined ? null : (
        <span className="min-w-0 flex-1 truncate text-small text-text-muted">
          {subtitle}
        </span>
      )}
      {actions === undefined ? null : (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
        </div>
      )}
    </header>
  );
}
