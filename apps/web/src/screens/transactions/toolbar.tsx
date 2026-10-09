import type { AccountView, CategoryView } from '@allotr/shared';
import { useEffect, useMemo, useState } from 'react';
import { Input, SearchField } from 'react-aria-components';
import {
  MenuButton,
  MenuCheckItem,
  MenuRadioItem,
  MenuSection,
} from '@/components/menu';
import { useFrameWidth } from '@/components/use-frame-width';
import {
  IconCalendarLine,
  IconFilter3Line,
  IconListCheck,
  IconSearchLine,
} from '@/generated/icons';
import { categoryTree } from '@/features/settings/categories-model';
import { t } from '@/messages/t';
import { StripControls } from '@/shell/strip-controls';
import { onFilterMenuRequest } from '@/shell/filter-menu';
import { applyFilterKeys, filterKeys } from './filter-model.ts';
import {
  GROUPS,
  PERIODS,
  TYPES,
  type Period,
  type TransactionsView,
} from './search-params.ts';

// The title strip's controls (docs/ui.md §6): search, period, filter and
// group by. Below 600 px the menus show only their icons.

const SEARCH_DELAY_MS = 300;

/** The one key of a single-selection menu, ignoring an empty selection. */
function onlyKey(keys: 'all' | Set<unknown>): string | undefined {
  if (keys === 'all') return undefined;
  const [key] = [...keys];
  return typeof key === 'string' ? key : undefined;
}

export function TransactionsToolbar({
  view,
  accounts,
  categories,
  filterCount,
  onChange,
}: {
  view: TransactionsView;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  /** How many filters are active, for the badge. */
  filterCount: number;
  onChange: (next: Partial<TransactionsView>) => void;
}) {
  const compact = useFrameWidth() < 600;
  const [filterOpen, setFilterOpen] = useState(false);
  const [text, setText] = useState(view.q ?? '');
  const [seenQ, setSeenQ] = useState(view.q);
  // The URL is the source of truth (a chip, back, a link): follow it.
  if (seenQ !== view.q) {
    setSeenQ(view.q);
    setText(view.q ?? '');
  }
  // Typing is debounced into the URL.
  useEffect(() => {
    if (text.trim() === (view.q ?? '')) return;
    const timer = window.setTimeout(() => {
      onChange({ q: text.trim() === '' ? undefined : text.trim() });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [text, view.q, onChange]);

  useEffect(
    () =>
      onFilterMenuRequest(() => {
        setFilterOpen(true);
      }),
    [],
  );

  const tree = useMemo(() => categoryTree(categories), [categories]);
  const selected = filterKeys(view);
  const open = accounts.filter((a) => !a.archived);

  return (
    <StripControls>
      <SearchField
        aria-label={t('transactions.list.search')}
        value={text}
        onChange={setText}
        className="flex min-w-0 flex-1 items-center gap-1 border border-outline px-2 medium:max-w-60"
      >
        <IconSearchLine aria-hidden="true" className="size-3.5 shrink-0" />
        <Input
          placeholder={t('transactions.list.search')}
          className="h-hit min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-ring"
        />
      </SearchField>
      <MenuButton
        label={t('transactions.list.period.label')}
        value={t(`transactions.list.period.${view.period}`)}
        icon={IconCalendarLine}
        iconOnly={compact}
        selectionMode="single"
        selectedKeys={new Set([view.period])}
        onSelectionChange={(keys) => {
          const next = onlyKey(keys);
          const period = PERIODS.find((p) => p === next);
          if (period !== undefined) onChange({ period });
        }}
      >
        {PERIODS.map((period: Period) => (
          <MenuRadioItem
            key={period}
            id={period}
            label={t(`transactions.list.period.${period}`)}
          />
        ))}
      </MenuButton>
      <MenuButton
        label={t('transactions.filter.label')}
        {...(filterCount > 0 ? { value: String(filterCount) } : {})}
        icon={IconFilter3Line}
        iconOnly={compact}
        open={filterOpen}
        onOpenChange={setFilterOpen}
        selectionMode="multiple"
        selectedKeys={selected}
        onSelectionChange={(keys) => {
          if (keys === 'all') return;
          const next = applyFilterKeys(
            view,
            new Set([...keys].map(String)),
            tree.expense.concat(tree.income, tree.transfer),
          );
          onChange({
            type: next.type,
            categories: next.categories,
            accounts: next.accounts,
          });
        }}
      >
        <MenuSection title={t('transactions.filter.type')}>
          {TYPES.map((type) => (
            <MenuRadioItem
              key={type}
              id={`type:${type}`}
              label={t(`transactions.filter.types.${type}`)}
            />
          ))}
        </MenuSection>
        <MenuSection title={t('transactions.filter.categories')}>
          {[...tree.expense, ...tree.income, ...tree.transfer].flatMap(
            (node) => [
              <MenuCheckItem
                key={node.category.id}
                id={`category:${node.category.id}`}
                label={node.category.name}
              />,
              ...node.children.map((child) => (
                <MenuCheckItem
                  key={child.id}
                  id={`category:${child.id}`}
                  label={child.name}
                  indent
                />
              )),
            ],
          )}
        </MenuSection>
        <MenuSection title={t('transactions.filter.accounts')}>
          {open.map((account) => (
            <MenuCheckItem
              key={account.id}
              id={`account:${account.id}`}
              label={account.name}
            />
          ))}
        </MenuSection>
      </MenuButton>
      <MenuButton
        label={t('transactions.list.group.label')}
        value={t(`transactions.list.group.${view.group}`)}
        icon={IconListCheck}
        iconOnly={compact}
        selectionMode="single"
        selectedKeys={new Set([view.group])}
        onSelectionChange={(keys) => {
          const next = onlyKey(keys);
          const group = GROUPS.find((g) => g === next);
          if (group !== undefined) onChange({ group: group });
        }}
      >
        {GROUPS.map((group) => (
          <MenuRadioItem
            key={group}
            id={group}
            label={t(`transactions.list.group.${group}`)}
          />
        ))}
      </MenuButton>
    </StripControls>
  );
}
