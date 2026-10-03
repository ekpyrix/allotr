import type { BudgetStatusView } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Section } from '@/features/settings/section';
import { budgetQueryKeys, setCoverOrder } from '@/lib/budgets';
import { describeProblem } from '@/lib/problem';
import { invalidate } from '@/lib/settings';
import { t } from '@/messages/t';
import { moveItem } from './order.ts';

type Item = BudgetStatusView['coverOrder'][number];

/**
 * The cover order (ADR 0021): who pays when spending passes a budget.
 * Drag a row by its handle, or press Up and Down on the handle (or use
 * the buttons, which also work by touch). The order saves on each move.
 */
export function CoverOrder({ items }: { items: readonly Item[] }) {
  const queryClient = useQueryClient();
  const [announce, setAnnounce] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  // A moved row is re-inserted, which drops focus; it returns to the handle
  // of the item that was moved once the new order renders.
  const focusId = useRef<string | null>(null);
  useEffect(() => {
    if (focusId.current === null) return;
    handles.current.get(focusId.current)?.focus();
    focusId.current = null;
  }, [items]);
  const save = useMutation({
    mutationFn: setCoverOrder,
    onSuccess: async () => {
      await invalidate(queryClient, budgetQueryKeys);
    },
  });
  const problem = save.isError ? describeProblem(save.error) : null;

  function move(from: number, to: number) {
    const item = items[from];
    if (item === undefined || to < 0 || to >= items.length || from === to)
      return;
    const next = moveItem(items, from, to);
    setAnnounce(
      t('budget.cover.moved', {
        name: label(item),
        position: to + 1,
        count: items.length,
      }),
    );
    focusId.current = item.id;
    save.mutate(next.map((i) => i.id));
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const delta =
      event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    move(index, index + delta);
  }

  return (
    <Section
      id="cover"
      title={t('budget.cover.title')}
      intro={t('budget.cover.intro')}
    >
      <ol
        className="mt-3 border-y border-outline-variant"
        aria-label={t('budget.cover.list')}
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            draggable
            onDragStart={() => {
              setDragging(index);
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={() => {
              if (dragging !== null) move(dragging, index);
              setDragging(null);
            }}
            onDragEnd={() => {
              setDragging(null);
            }}
            className="flex items-center gap-2 border-b border-outline-variant py-1 pl-1 last:border-b-0"
          >
            <button
              type="button"
              ref={(el) => {
                if (el === null) handles.current.delete(item.id);
                else handles.current.set(item.id, el);
              }}
              aria-roledescription={t('budget.cover.sortable')}
              aria-label={t('budget.cover.handle', {
                name: label(item),
                position: index + 1,
                count: items.length,
              })}
              onKeyDown={(e) => {
                onKeyDown(e, index);
              }}
              className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md text-text-muted hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <GripVertical aria-hidden="true" className="size-5" />
            </button>
            <span className="min-w-0 flex-1 text-body wrap-anywhere">
              <span className="text-text-muted">{index + 1}. </span>
              {label(item)}
            </span>
            <Button
              variant="text"
              size="icon"
              aria-label={t('budget.cover.up', { name: label(item) })}
              disabled={index === 0 || save.isPending}
              onClick={() => {
                move(index, index - 1);
              }}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              variant="text"
              size="icon"
              aria-label={t('budget.cover.down', { name: label(item) })}
              disabled={index === items.length - 1 || save.isPending}
              onClick={() => {
                move(index, index + 1);
              }}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-caption text-text-muted">
        {t('budget.cover.billsNever')}
      </p>
      <p role="status" className="sr-only">
        {announce}
      </p>
      <FormError message={problem?.message ?? null} />
    </Section>
  );
}

function label(item: Item): string {
  return item.kind === 'free' ? t('budget.cover.free') : item.name;
}
