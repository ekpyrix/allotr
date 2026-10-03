import type { AccountView, CategoryView } from '@allotr/shared';
import { Search, X } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FieldControl, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { categoryOptions } from '@/features/quick-entry/options';
import { t } from '@/messages/t';
import { isFiltered, type LedgerSearch } from './search.ts';

const kinds = ['expense', 'income', 'transfer'] as const;

// Selects and dates apply as they change; the note search applies on
// submit, so typing does not refetch on every key.
export function LedgerFilters({
  search,
  accounts,
  categories,
  tags,
  onChange,
}: {
  search: LedgerSearch;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  tags: readonly { id: string; name: string }[];
  onChange: (patch: Partial<LedgerSearch>) => void;
}) {
  // Keyed on the applied search by the caller, so back and forward reset it.
  const [q, setQ] = useState(search.q ?? '');
  const deletedId = useId();
  const set =
    (key: keyof LedgerSearch) =>
    (event: { currentTarget: { value: string } }) => {
      const value = event.currentTarget.value;
      onChange({ [key]: value === '' ? undefined : value });
    };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = q.trim();
    onChange({ q: text === '' ? undefined : text });
  }

  return (
    <form
      role="search"
      aria-label={t('ledger.filters.label')}
      onSubmit={submit}
      className="mt-6 grid gap-4"
    >
      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute bottom-3.5 left-4 size-5 text-text-muted"
          />
          <FieldControl label={t('ledger.filters.search')}>
            {(props) => (
              <Input
                {...props}
                name="q"
                type="search"
                maxLength={100}
                autoComplete="off"
                className="rounded-md pl-11"
                value={q}
                onChange={(e) => {
                  setQ(e.currentTarget.value);
                }}
              />
            )}
          </FieldControl>
        </div>
        <Button type="submit" variant="tonal">
          {t('ledger.filters.searchSubmit')}
        </Button>
      </div>

      {/* Scrolls sideways inside itself, never the page. */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 medium:-mx-6 medium:px-6 [&>*]:w-44 [&>*]:shrink-0">
        <FieldControl label={t('ledger.filters.account')}>
          {(props) => (
            <select
              {...props}
              name="account"
              className={selectClass}
              value={search.account ?? ''}
              onChange={set('account')}
            >
              <option value="">{t('ledger.filters.allAccounts')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.archived
                    ? t('ledger.filters.archived', { name: a.name })
                    : a.name}
                </option>
              ))}
            </select>
          )}
        </FieldControl>

        <FieldControl label={t('ledger.filters.category')}>
          {(props) => (
            <select
              {...props}
              name="category"
              className={selectClass}
              value={search.category ?? ''}
              onChange={set('category')}
            >
              <option value="">{t('ledger.filters.allCategories')}</option>
              {kinds.map((kind) => {
                const options = categoryOptions(categories, kind);
                return options.length === 0 ? null : (
                  <optgroup
                    key={kind}
                    label={t(`ledger.filters.kinds.${kind}`)}
                  >
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          )}
        </FieldControl>

        {tags.length === 0 && search.tag === undefined ? null : (
          <FieldControl label={t('ledger.filters.tag')}>
            {(props) => (
              <select
                {...props}
                name="tag"
                className={selectClass}
                value={search.tag ?? ''}
                onChange={set('tag')}
              >
                <option value="">{t('ledger.filters.allTags')}</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            )}
          </FieldControl>
        )}

        <FieldControl label={t('ledger.filters.from')}>
          {(props) => (
            <Input
              {...props}
              name="from"
              type="date"
              value={search.from ?? ''}
              onChange={set('from')}
            />
          )}
        </FieldControl>

        <FieldControl label={t('ledger.filters.to')}>
          {(props) => (
            <Input
              {...props}
              name="to"
              type="date"
              value={search.to ?? ''}
              onChange={set('to')}
            />
          )}
        </FieldControl>
      </div>

      <div className="flex items-center gap-3">
        <input
          id={deletedId}
          type="checkbox"
          name="deleted"
          checked={search.deleted === 'show'}
          onChange={(e) => {
            onChange({ deleted: e.currentTarget.checked ? 'show' : undefined });
          }}
          className="size-4 accent-primary"
        />
        <label htmlFor={deletedId}>{t('ledger.filters.showDeleted')}</label>
      </div>

      {isFiltered(search) ? (
        <div>
          <Button
            type="button"
            variant="text"
            onClick={() => {
              setQ('');
              onChange({
                account: undefined,
                category: undefined,
                tag: undefined,
                from: undefined,
                to: undefined,
                q: undefined,
              });
            }}
          >
            <X aria-hidden />
            {t('ledger.filters.clear')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
