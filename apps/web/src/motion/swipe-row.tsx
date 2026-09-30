import { MotionProvider } from './provider.tsx';
import { animate, m, useMotionValue, type PanInfo } from 'motion/react';
import { MoreHorizontal } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '@/components/ui/icon-button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { useEffectiveMotion } from '@/lib/device-prefs';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { haptic } from './haptics.ts';
import { springConfig } from './springs.ts';

// A row with swipe actions (spec §9.2). Swiping left reveals the trailing
// actions, swiping right the leading ones, from 64 px; a haptic tick marks
// each threshold. A full swipe (past half the row) runs an action only if
// it says so, and irreversible actions never do. Every action is also in
// the row's "More actions" menu, which is how keyboards and screen readers
// reach them: the revealed buttons are a pointer shortcut and are hidden
// from assistive technology. Swiping is off when motion is off.

export type SwipeAction = Readonly<{
  label: string;
  icon: ReactNode;
  onAction: () => void;
  tone?: 'tonal' | 'danger';
  /** Runs on a full swipe; never set it for an irreversible action. */
  commitOnFullSwipe?: boolean;
}>;

export const REVEAL = 64;
const ACTION_WIDTH = 72;

/** Where a released swipe settles: the offset, and a full-swipe action. */
export function settleSwipe(
  x: number,
  width: number,
  leading: readonly SwipeAction[],
  trailing: readonly SwipeAction[],
): { offset: number; commit?: SwipeAction } {
  const side = x > 0 ? leading : trailing;
  const full = side.find((action) => action.commitOnFullSwipe === true);
  if (full !== undefined && Math.abs(x) > width / 2)
    return { offset: 0, commit: full };
  if (Math.abs(x) < REVEAL || side.length === 0) return { offset: 0 };
  return { offset: Math.sign(x) * side.length * ACTION_WIDTH };
}

function ActionButtons({
  actions,
  onDone,
  align,
}: {
  actions: readonly SwipeAction[];
  onDone: () => void;
  align: 'start' | 'end';
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'absolute inset-y-0 flex',
        align === 'start' ? 'left-0' : 'right-0',
      )}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          tabIndex={-1}
          onClick={() => {
            action.onAction();
            onDone();
          }}
          className={cn(
            'flex w-18 flex-col items-center justify-center gap-1 text-label [&_svg]:size-5',
            action.tone === 'danger'
              ? 'bg-danger-container text-on-danger-container'
              : 'bg-primary-container text-on-primary-container',
          )}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}

function SwipeRowBody({
  label,
  leading = [],
  trailing = [],
  children,
  className,
}: {
  /** Names the row in its menu button: "More actions for Lunch". */
  label: string;
  leading?: readonly SwipeAction[];
  trailing?: readonly SwipeAction[];
  children: ReactNode;
  className?: string;
}) {
  const motion = useEffectiveMotion();
  const x = useMotionValue(0);
  const row = useRef<HTMLDivElement>(null);
  const crossed = useRef({ reveal: false, full: false });
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = row.current;
    if (element === null) return;
    setWidth(element.offsetWidth);
    const observer = new ResizeObserver(() => {
      setWidth(element.offsetWidth);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const swipes = motion !== 'off';
  const actions = [...trailing, ...leading];

  function settle(offset: number) {
    if (motion === 'full') void animate(x, offset, springConfig('smooth'));
    else x.set(offset);
  }

  function onDrag(_: unknown, info: PanInfo) {
    const distance = Math.abs(info.offset.x);
    const reveal = distance >= REVEAL;
    const full = distance > width / 2;
    if (reveal !== crossed.current.reveal || full !== crossed.current.full)
      haptic('tick');
    crossed.current = { reveal, full };
  }

  function onDragEnd() {
    setDragging(false);
    crossed.current = { reveal: false, full: false };
    const { offset, commit } = settleSwipe(x.get(), width, leading, trailing);
    settle(offset);
    commit?.onAction();
  }

  return (
    <div
      ref={row}
      className={cn('group/swipe relative overflow-hidden', className)}
    >
      {swipes ? (
        <>
          <ActionButtons
            actions={leading}
            align="start"
            onDone={() => {
              settle(0);
            }}
          />
          <ActionButtons
            actions={trailing}
            align="end"
            onDone={() => {
              settle(0);
            }}
          />
        </>
      ) : null}
      <m.div
        drag={swipes ? 'x' : false}
        dragDirectionLock
        dragElastic={0.15}
        dragMomentum={false}
        dragConstraints={{
          left: -(trailing.some((a) => a.commitOnFullSwipe === true)
            ? width
            : trailing.length * ACTION_WIDTH),
          right: leading.some((a) => a.commitOnFullSwipe === true)
            ? width
            : leading.length * ACTION_WIDTH,
        }}
        onDragStart={() => {
          setDragging(true);
        }}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        data-dragging={dragging ? '' : undefined}
        style={{ x }}
        className="relative flex items-center bg-card"
      >
        <div className="min-w-0 flex-1">{children}</div>
        {actions.length === 0 ? null : (
          <Menu>
            <MenuTrigger asChild>
              <IconButton
                aria-label={t('ui.moreActionsFor', { label })}
                className="shrink-0 opacity-0 group-focus-within/swipe:opacity-100 group-hover/swipe:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              >
                <MoreHorizontal />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              {actions.map((action) => (
                <MenuItem
                  key={action.label}
                  variant={action.tone === 'danger' ? 'danger' : undefined}
                  onSelect={action.onAction}
                >
                  {action.icon}
                  {action.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
      </m.div>
    </div>
  );
}

/** The row, with Motion set up around it (ADR 0019). */
export function SwipeRow(props: {
  /** Names the row in its menu button: "More actions for Lunch". */
  label: string;
  leading?: readonly SwipeAction[];
  trailing?: readonly SwipeAction[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <MotionProvider>
      <SwipeRowBody {...props} />
    </MotionProvider>
  );
}
