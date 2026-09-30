import type { AccountView, CategoryView } from '@allotr/shared';
import { Search, X } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
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
        <div className="min-w-0 flex-1">
          <FieldControl label={t('ledger.filters.search')}>
            {(props) => (
              <Input
                {...props}
                name="q"
                type="search"
                maxLength={100}
                autoComplete="off"
                className="h-11 text-base"
                value={q}
                onChange={(e) => {
                  setQ(e.currentTarget.value);
                }}
              />
            )}
          </FieldControl>
        </div>
        <Button type="submit" variant="outlined" className="h-11">
          <Search aria-hidden />
          {t('ledger.filters.searchSubmit')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
              className="h-11 text-base"
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
              className="h-11 text-base"
              value={search.to ?? ''}
              onChange={set('to')}
            />
          )}
        </FieldControl>
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
