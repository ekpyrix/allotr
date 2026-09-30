import { MotionProvider } from './provider.tsx';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import {
  animate,
  m,
  useDragControls,
  useMotionValue,
  type PanInfo,
} from 'motion/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { IconButton } from '@/components/ui/icon-button';
import { useEffectiveMotion } from '@/lib/device-prefs';
import { t } from '@/messages/t';
import { haptic } from './haptics.ts';
import { springConfig, EASE_EXIT } from './springs.ts';

// Bottom sheet (spec §8.2, §7.3): a Radix Dialog, so focus is trapped and
// returns to the opener, and Escape closes it. On phones it rises from the
// bottom and rests at a detent (medium, half the screen; large, 92 %);
// dragging hands its velocity to the spring and snaps to the nearest
// detent, and a drag past 30 % of the open height or a flick faster than
// 800 px/s dismisses it. Drags start on the handle strip, so the content
// scrolls normally; the handle is also a real button that cycles the
// detents. From the expanded size class up it is a centred dialog.

export type Detent = 'medium' | 'large';

const DETENT_FRACTION: Readonly<Record<Detent, number>> = {
  medium: 0.5,
  large: 0.92,
};
const FLICK = 800;
const DISMISS_FRACTION = 0.3;
const PROJECTION = 0.2;

const expandedQuery = '(min-width: 840px)';

function subscribeExpanded(callback: () => void) {
  const media = window.matchMedia(expandedQuery);
  media.addEventListener('change', callback);
  return () => {
    media.removeEventListener('change', callback);
  };
}

function useExpanded(): boolean {
  return useSyncExternalStore(
    subscribeExpanded,
    () => window.matchMedia(expandedQuery).matches,
    () => false,
  );
}

function viewportHeight(): number {
  return window.innerHeight;
}

/** The y offset of the sheet (height 92 % of the screen) at a detent. */
export function detentOffset(detent: Detent, height: number): number {
  return Math.round((DETENT_FRACTION.large - DETENT_FRACTION[detent]) * height);
}

/**
 * Where a drag ends up: the detent nearest to where it was heading, or
 * null to dismiss.
 */
export function settleDrag(
  detents: readonly Detent[],
  from: Detent,
  y: number,
  velocity: number,
  height: number,
): Detent | null {
  const openHeight = DETENT_FRACTION[from] * height;
  const dragged = y - detentOffset(from, height);
  if (velocity > FLICK || dragged > openHeight * DISMISS_FRACTION) return null;
  const projected = y + velocity * PROJECTION;
  return detents.reduce((best, detent) =>
    Math.abs(detentOffset(detent, height) - projected) <
    Math.abs(detentOffset(best, height) - projected)
      ? detent
      : best,
  );
}

function SheetBody({
  open,
  onOpenChange,
  title,
  description,
  detents = ['medium', 'large'],
  defaultDetent = 'medium',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  detents?: readonly Detent[];
  defaultDetent?: Detent;
  children: ReactNode;
}) {
  const expanded = useExpanded();
  const motion = useEffectiveMotion();
  const [detent, setDetent] = useState<Detent>(defaultDetent);
  const [height, setHeight] = useState(viewportHeight);
  const y = useMotionValue(height);
  const drag = useDragControls();
  const risen = useRef(false);
  // Radix returns focus to its own Trigger; a sheet can be opened by any
  // control, so it remembers what had focus as it opened.
  const opener = useRef<HTMLElement | null>(null);
  const focusHandlers = {
    onOpenAutoFocus: () => {
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      opener.current?.focus();
    },
  };

  useEffect(() => {
    const resize = () => {
      setHeight(viewportHeight());
    };
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  const moveTo = useCallback(
    (target: Detent) => {
      setDetent(target);
      const offset = detentOffset(target, height);
      if (motion === 'full') void animate(y, offset, springConfig('smooth'));
      else y.set(offset);
    },
    [height, motion, y],
  );

  // Opening rises from below the screen to the default detent, once per
  // opening; a resize keeps the current detent.
  useEffect(() => {
    if (!open) {
      risen.current = false;
      return;
    }
    if (expanded || risen.current) return;
    risen.current = true;
    y.set(height);
    moveTo(defaultDetent);
  }, [open, expanded, height, moveTo, defaultDetent, y]);

  const dismiss = useCallback(() => {
    if (motion !== 'full' || expanded) {
      onOpenChange(false);
      return;
    }
    void animate(y, height, {
      duration: EASE_EXIT.ms / 1000,
      ease: [0.3, 0, 1, 1],
    }).then(() => {
      onOpenChange(false);
    });
  }, [expanded, height, motion, onOpenChange, y]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const target = settleDrag(
      detents,
      detent,
      y.get(),
      info.velocity.y,
      height,
    );
    if (target === null) {
      dismiss();
      return;
    }
    if (target !== detent) haptic('tick');
    moveTo(target);
  }

  function cycle() {
    const next = detents[(detents.indexOf(detent) + 1) % detents.length];
    if (next !== undefined) moveTo(next);
  }

  const header = (
    <div className="flex items-start justify-between gap-4">
      <DialogPrimitive.Title className="pt-3 text-title">
        {title}
      </DialogPrimitive.Title>
      <DialogPrimitive.Close asChild>
        <IconButton aria-label={t('ui.close')} className="-mt-1 -mr-3">
          <X />
        </IconButton>
      </DialogPrimitive.Close>
    </div>
  );
  const body = (
    <>
      {header}
      {description === undefined ? null : (
        <DialogPrimitive.Description className="mt-2 text-body text-text-muted">
          {description}
        </DialogPrimitive.Description>
      )}
      <div className="mt-4">{children}</div>
    </>
  );
  const describedBy =
    description === undefined ? { 'aria-describedby': undefined } : {};

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else dismiss();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:scrim-in dark:bg-black/60" />
        {expanded ? (
          <DialogPrimitive.Content
            className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-outline-variant bg-card-raised p-6 text-text data-[state=open]:overlay-in"
            {...focusHandlers}
            {...describedBy}
          >
            {body}
          </DialogPrimitive.Content>
        ) : (
          <DialogPrimitive.Content asChild {...focusHandlers} {...describedBy}>
            <m.div
              drag={motion === 'off' ? false : 'y'}
              dragControls={drag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: height }}
              dragElastic={{ top: 0.05, bottom: 0.4 }}
              dragMomentum={false}
              onDragEnd={onDragEnd}
              style={{ y, height: `${String(DETENT_FRACTION.large * 100)}dvh` }}
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border border-b-0 border-outline-variant bg-card-raised text-text"
            >
              <div
                className="flex shrink-0 touch-none justify-center pt-2 pb-1"
                onPointerDown={(event) => {
                  drag.start(event);
                }}
              >
                <button
                  type="button"
                  aria-label={t('ui.resize')}
                  onClick={cycle}
                  className="flex h-8 w-16 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span
                    aria-hidden="true"
                    className="h-1 w-9 rounded-full bg-outline"
                  />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                {body}
              </div>
            </m.div>
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The sheet, with Motion set up around it (ADR 0019). */
export function Sheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  detents?: readonly Detent[];
  defaultDetent?: Detent;
  children: ReactNode;
}) {
  return (
    <MotionProvider>
      <SheetBody {...props} />
    </MotionProvider>
  );
}
