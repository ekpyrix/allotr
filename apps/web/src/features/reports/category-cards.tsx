import type { CategorySummaryView, CategoryView } from '@allotr/shared';
import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { Amount } from '@/components/ui/amount';
import { Card } from '@/components/ui/card';
import { CategoryIcon } from '@/components/ui/category-icon';
import { categoryStyles, type CategoryStyle } from '@/lib/category-style';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';

// Category summary cards (FR-W2): one per top-level category with what its
// subcategories add up to. The server rolls the totals up; the card shows
// the top two subcategories and expands to the rest, or always shows all
// when the device setting says so.

type Group = CategorySummaryView['spending'][number];

/** How many subcategories a collapsed card shows. */
export const TOP_CHILDREN = 2;

function CategoryCard({
  group,
  names,
  styles,
  locale,
  expandAlways,
  kind,
}: {
  group: Group;
  names: ReadonlyMap<string, string>;
  styles: ReadonlyMap<string, CategoryStyle>;
  locale: string;
  expandAlways: boolean;
  kind: 'spending' | 'income';
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const name =
    group.categoryId === null
      ? t('reports.noCategory')
      : (names.get(group.categoryId) ?? t('reports.noCategory'));
  const style =
    group.categoryId === null ? undefined : styles.get(group.categoryId);
  const { children } = group;
  const expanded = expandAlways || open;
  const shown = expanded ? children : children.slice(0, TOP_CHILDREN);
  // A group whose only figure is booked on the parent has nothing to open.
  const onlyOwn =
    children.length === 0 ||
    (children.length === 1 && children[0]?.categoryId === group.categoryId);
  const canToggle = !expandAlways && children.length > TOP_CHILDREN;

  return (
    <li data-testid="category-card" data-category-id={group.categoryId ?? ''}>
      <Card className="grid gap-2">
        <div className="flex items-center gap-3">
          {style === undefined ? null : <CategoryIcon style={style} />}
          <h3 className="min-w-0 flex-1 text-title wrap-anywhere">{name}</h3>
          <Amount
            amount={group.amount}
            locale={locale}
            signDisplay={kind === 'income' ? 'always' : 'never'}
            className={cn('text-title', kind === 'spending' && 'text-negative')}
          />
        </div>
        {onlyOwn ? null : (
          <ul
            id={panel}
            className="grid gap-1 border-t border-outline-variant pt-2"
          >
            {shown.map((child) => (
              <li
                key={child.categoryId ?? ''}
                className="flex items-baseline justify-between gap-3 text-body"
              >
                <span className="min-w-0 wrap-anywhere text-text-muted">
                  {child.categoryId === group.categoryId
                    ? t('reports.directly', { name })
                    : (names.get(child.categoryId ?? '') ?? '')}
                </span>
                <Amount
                  plain
                  amount={child.amount}
                  locale={locale}
                  signDisplay="never"
                />
              </li>
            ))}
          </ul>
        )}
        {canToggle ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => {
              setOpen(!open);
            }}
            className="flex min-h-11 items-center gap-1 justify-self-start text-label text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-4 transition-transform',
                open && 'rotate-180',
              )}
            />
            {open
              ? t('reports.showTop', { count: TOP_CHILDREN })
              : t('reports.showAll', { count: children.length })}
          </button>
        ) : null}
      </Card>
    </li>
  );
}

export function CategoryCards({
  groups,
  kind,
  title,
  empty,
  categories,
  locale,
  expandAll,
}: {
  groups: readonly Group[];
  kind: 'spending' | 'income';
  title: string;
  empty: string;
  categories: readonly CategoryView[];
  locale: string;
  /** List every subcategory instead of the top two. */
  expandAll: boolean;
}) {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const styles = categoryStyles(categories);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-title">
        {title}
      </h2>
      {groups.length === 0 ? (
        <p className="mt-2 text-text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-3 medium:grid-cols-2">
          {groups.map((group) => (
            <CategoryCard
              key={group.categoryId ?? 'none'}
              group={group}
              names={names}
              styles={styles}
              locale={locale}
              expandAlways={expandAll}
              kind={kind}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
