import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import {
  overflows,
  scrollTopFromThumb,
  thumbOffset,
  thumbSize,
} from './overlay-scrollbar-math.ts';

type Metrics = { viewport: number; content: number; top: number };

/**
 * A scroll area with the native bar hidden and a thin thumb drawn over the
 * right edge (docs/ui.md §3). It takes no width, so content never reflows.
 * The scroll element stays focusable so the keyboard scrolls it.
 */
export function OverlayScrollbar({
  label,
  className,
  children,
}: {
  /** Accessible name of the scrollable region. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startOffset: number } | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    viewport: 0,
    content: 0,
    top: 0,
  });
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (el === null) return;
    setMetrics({
      viewport: el.clientHeight,
      content: el.scrollHeight,
      top: el.scrollTop,
    });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      observer.disconnect();
    };
  }, [measure]);

  const { viewport, content, top } = metrics;
  const visible = overflows(viewport, content);
  const size = thumbSize(viewport, content);
  const offset = thumbOffset(viewport, content, top);

  const onThumbDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startOffset: offset };
    setDragging(true);
  };
  const onThumbMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (drag.current === null || el === null) return;
    const next = drag.current.startOffset + event.clientY - drag.current.startY;
    el.scrollTop = scrollTopFromThumb(viewport, content, next);
  };
  const onThumbUp = () => {
    drag.current = null;
    setDragging(false);
  };
  // Clicking the track scrolls a page towards the click.
  const onTrackDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (el === null || event.target !== event.currentTarget) return;
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    el.scrollBy({ top: y < offset ? -viewport : viewport });
  };

  return (
    <div className={cn('relative min-h-0', className)}>
      <div
        ref={scroller}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={measure}
        className="scroll size-full"
      >
        {children}
      </div>
      {visible ? (
        <div
          aria-hidden="true"
          onPointerDown={onTrackDown}
          className="group absolute inset-y-0 right-0 w-2"
        >
          <div
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={onThumbUp}
            style={{
              height: size,
              transform: `translateY(${String(offset)}px)`,
            }}
            className={cn(
              'absolute right-0 bg-outline',
              dragging ? 'w-[7px]' : 'w-1 group-hover:w-[7px]',
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
