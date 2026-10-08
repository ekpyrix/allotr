import type { CategoryIcon as CategoryIconKey } from '@allotr/shared';
import type { ComponentType, ReactNode } from 'react';
import {
  categoryIconComponents,
  IconCheckLine,
  type IconProps,
} from '@/generated/icons';
import { cn } from '@/lib/utils';
import { BracketButton } from './buttons.tsx';
import { useAutoDismiss } from './use-auto-dismiss.ts';

const seriesText = {
  1: 'text-series-1',
  2: 'text-series-2',
  3: 'text-series-3',
  4: 'text-series-4',
  5: 'text-series-5',
  6: 'text-series-6',
  7: 'text-series-7',
  8: 'text-series-8',
} as const;

/** A Remix glyph for a stored category key, in its series colour. */
export function CategoryIcon({
  name,
  color,
  className,
}: {
  name: CategoryIconKey;
  color?: keyof typeof seriesText;
  className?: string;
}) {
  const Icon = categoryIconComponents[name];
  return (
    <Icon
      className={cn(
        'size-4 shrink-0',
        color === undefined ? 'text-text-muted' : seriesText[color],
        className,
      )}
    />
  );
}

/** What will appear here and how to add the first one, in a blank tile. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: ComponentType<IconProps>;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-1 px-3 py-4">
      {Icon === undefined ? null : <Icon className="size-5 text-text-muted" />}
      <p className="text-base font-semibold">{title}</p>
      <p className="font-ui text-small text-text-muted">{hint}</p>
      {action === undefined ? null : <div className="mt-1">{action}</div>}
    </div>
  );
}

/** After logging: ✓, category icon, amount, account, "left today", undo. */
export function ResultLine({
  icon,
  amount,
  account,
  left,
  undoLabel,
  onUndo,
  onDismiss,
  dismissAfterMs = 5000,
}: {
  icon: ReactNode;
  amount: ReactNode;
  account: string;
  left: ReactNode;
  undoLabel: string;
  onUndo: () => void;
  onDismiss?: () => void;
  dismissAfterMs?: number;
}) {
  useAutoDismiss(dismissAfterMs, () => {
    onDismiss?.();
  });
  return (
    <div
      role="status"
      aria-live="polite"
      className="enter-sheet flex min-h-row items-center gap-2 border-t bg-canvas px-3 text-small"
    >
      <IconCheckLine className="size-4 shrink-0 text-positive" />
      {icon}
      <span className="shrink-0">{amount}</span>
      <span className="min-w-0 flex-1 truncate font-ui text-text-muted">
        {account}
      </span>
      <span className="shrink-0">{left}</span>
      <BracketButton onPress={onUndo}>{undoLabel}</BracketButton>
    </div>
  );
}
