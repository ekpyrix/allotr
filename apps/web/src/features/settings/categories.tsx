import type { CategoryView } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useId, useState, type ReactNode, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/features/accounts/sheet';
import { ApiError } from '@/lib/api';
import { describeProblem } from '@/lib/problem';
import {
  categoryQueryKeys,
  createCategory,
  deleteCategory,
  invalidate,
  updateCategory,
} from '@/lib/settings';
import { t } from '@/messages/t';
import {
  CATEGORY_KINDS,
  categoryPath,
  categoryTree,
  mergeTargets,
  type CategoryKind,
} from './categories-model.ts';
import { Section } from './section.tsx';
import { useBusy } from './use-busy.ts';

type Open =
  | { kind: 'create'; parentId?: string | undefined }
  | { kind: 'edit' | 'delete'; category: CategoryView }
  | null;

function useCategoryChange<A, R>(run: (args: A) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await invalidate(queryClient, categoryQueryKeys);
    },
  });
}

function PaycheckBox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        name="isPaycheck"
        checked={checked}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          onChange(e.currentTarget.checked);
        }}
        className="mt-1 size-4 accent-primary"
      />
      <div>
        <label htmlFor={id} className="font-medium">
          {t('settings.categories.paycheck')}
        </label>
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {t('settings.categories.paycheckHint')}
        </p>
      </div>
    </div>
  );
}

function CreateCategoryForm({
  categories,
  parentId: initialParent,
  onDone,
  onBusyChange,
}: {
  categories: readonly CategoryView[];
  parentId: string | undefined;
  onDone: (name: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(initialParent ?? '');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [isPaycheck, setIsPaycheck] = useState(false);
  const kindName = useId();
  const create = useCategoryChange(createCategory);
  useBusy(create.isPending, onBusyChange);
  const parents = categories.filter(
    (c) => c.parentId === null && c.mergedIntoId === null,
  );
  const parent = parents.find((c) => c.id === parentId);
  const effectiveKind = parent?.kind ?? kind;
  const problem = create.isError ? describeProblem(create.error) : null;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(
      {
        name: name.trim(),
        ...(parent === undefined ? { kind } : { parentId: parent.id }),
        isPaycheck: effectiveKind === 'income' && isPaycheck,
      },
      {
        onSuccess: (created) => {
          onDone(created.name);
        },
      },
    );
  }

  return (
    <form className="mt-6 grid gap-5" onSubmit={submit} noValidate>
      <FieldControl
        label={t('settings.categories.name')}
        error={problem?.fields.name}
      >
        {(props) => (
          <Input
            {...props}
            name="name"
            value={name}
            maxLength={100}
            required
            autoComplete="off"
            className="h-11 text-base"
            onChange={(e) => {
              setName(e.currentTarget.value);
              if (create.isError) create.reset();
            }}
          />
        )}
      </FieldControl>
      <FieldControl label={t('settings.categories.parent')}>
        {(props) => (
          <select
            {...props}
            name="parentId"
            value={parentId}
            className={selectClass}
            onChange={(e) => {
              setParentId(e.currentTarget.value);
            }}
          >
            <option value="">{t('settings.categories.topLevel')}</option>
            {parents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({t(`settings.categories.kinds.${c.kind}`)})
              </option>
            ))}
          </select>
        )}
      </FieldControl>
      {parent === undefined ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">
            {t('settings.categories.kind')}
          </legend>
          {CATEGORY_KINDS.map((option) => (
            <label key={option} className="flex items-center gap-3">
              <input
                type="radio"
                name={kindName}
                value={option}
                checked={kind === option}
                onChange={() => {
                  setKind(option);
                }}
                className="size-4 accent-primary"
              />
              {t(`settings.categories.kinds.${option}`)}
            </label>
          ))}
        </fieldset>
      ) : null}
      {effectiveKind === 'income' ? (
        <PaycheckBox checked={isPaycheck} onChange={setIsPaycheck} />
      ) : null}
      <FormError message={problem?.message ?? null} />
      <Button type="submit" className="h-11" disabled={create.isPending}>
        {create.isPending
          ? t('settings.saving')
          : t('settings.categories.addSubmit')}
      </Button>
    </form>
  );
}

function EditCategoryForm({
  category,
  onDone,
  onCancel,
  onBusyChange,
}: {
  category: CategoryView;
  onDone: (name: string) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [name, setName] = useState(category.name);
  const [isPaycheck, setIsPaycheck] = useState(category.isPaycheck);
  const update = useCategoryChange(
    (body: { name?: string; isPaycheck?: boolean }) =>
      updateCategory(category.id, body),
  );
  useBusy(update.isPending, onBusyChange);
  const problem = update.isError ? describeProblem(update.error) : null;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      ...(name.trim() === category.name ? {} : { name: name.trim() }),
      ...(isPaycheck === category.isPaycheck ? {} : { isPaycheck }),
    };
    if (Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    update.mutate(body, {
      onSuccess: (updated) => {
        onDone(updated.name);
      },
    });
  }

  return (
    <form className="mt-6 grid gap-5" onSubmit={submit} noValidate>
      <FieldControl
        label={t('settings.categories.name')}
        error={problem?.fields.name}
      >
        {(props) => (
          <Input
            {...props}
            name="name"
            value={name}
            maxLength={100}
            required
            autoComplete="off"
            className="h-11 text-base"
            onChange={(e) => {
              setName(e.currentTarget.value);
              if (update.isError) update.reset();
            }}
          />
        )}
      </FieldControl>
      {category.kind === 'income' ? (
        <PaycheckBox checked={isPaycheck} onChange={setIsPaycheck} />
      ) : null}
      <FormError message={problem?.message ?? null} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11" disabled={update.isPending}>
          {update.isPending ? t('settings.saving') : t('settings.save')}
        </Button>
        <Button
          type="button"
          variant="outlined"
          className="h-11"
          disabled={update.isPending}
          onClick={onCancel}
        >
          {t('settings.cancel')}
        </Button>
      </div>
    </form>
  );
}

function DeleteCategoryFlow({
  category,
  categories,
  onDone,
  onCancel,
  onBusyChange,
}: {
  category: CategoryView;
  categories: readonly CategoryView[];
  onDone: (merged: string | undefined) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  // A category that entries use cannot just go: the server says so, and
  // the flow asks where its entries should move.
  const [needsTarget, setNeedsTarget] = useState(false);
  const [target, setTarget] = useState('');
  const [missingTarget, setMissingTarget] = useState(false);
  const remove = useCategoryChange((mergeInto: string | undefined) =>
    deleteCategory(category.id, mergeInto),
  );
  useBusy(remove.isPending, onBusyChange);
  const targets = mergeTargets(category, categories);
  const hasChildren = categories.some(
    (c) => c.parentId === category.id && c.mergedIntoId === null,
  );
  const problem = remove.isError ? describeProblem(remove.error).message : null;

  if (hasChildren)
    return (
      <div className="mt-4 grid gap-4">
        <p>{t('settings.categories.hasChildren')}</p>
        <Button variant="outlined" className="h-11" onClick={onCancel}>
          {t('settings.close')}
        </Button>
      </div>
    );

  if (needsTarget)
    return (
      <form
        className="mt-4 grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (target === '') {
            setMissingTarget(true);
            return;
          }
          const label = targets.find((c) => c.id === target)?.label;
          remove.mutate(target, {
            onSuccess: () => {
              onDone(label);
            },
          });
        }}
      >
        <p>{t('settings.categories.inUse', { name: category.name })}</p>
        {targets.length === 0 ? (
          <p>
            {t('settings.categories.noTargets', {
              kind: t(`settings.categories.kinds.${category.kind}`),
            })}
          </p>
        ) : (
          <FieldControl
            label={t('settings.categories.mergeInto')}
            error={
              missingTarget ? t('settings.categories.chooseTarget') : undefined
            }
          >
            {(props) => (
              <select
                {...props}
                name="mergeInto"
                value={target}
                autoFocus
                className={selectClass}
                onChange={(e) => {
                  setTarget(e.currentTarget.value);
                  setMissingTarget(false);
                }}
              >
                <option value="">{t('settings.categories.chooseOne')}</option>
                {targets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </FieldControl>
        )}
        <FormError message={problem} />
        <div className="flex flex-wrap gap-3">
          {targets.length === 0 ? null : (
            <Button type="submit" className="h-11" disabled={remove.isPending}>
              {remove.isPending
                ? t('settings.saving')
                : t('settings.categories.mergeSubmit')}
            </Button>
          )}
          <Button
            type="button"
            variant="outlined"
            className="h-11"
            disabled={remove.isPending}
            onClick={onCancel}
          >
            {t('settings.cancel')}
          </Button>
        </div>
      </form>
    );

  return (
    <div className="mt-4 grid gap-5">
      <p>{t('settings.categories.deleteIntro')}</p>
      <FormError message={problem} />
      <div className="flex flex-wrap gap-3">
        <Button
          className="h-11"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(undefined, {
              onSuccess: () => {
                onDone(undefined);
              },
              onError: (error) => {
                if (
                  error instanceof ApiError &&
                  error.problem.code === 'category_in_use'
                ) {
                  remove.reset();
                  setNeedsTarget(true);
                }
              },
            });
          }}
        >
          {remove.isPending
            ? t('settings.saving')
            : t('settings.categories.deleteSubmit')}
        </Button>
        <Button
          variant="outlined"
          className="h-11"
          disabled={remove.isPending}
          onClick={onCancel}
        >
          {t('settings.cancel')}
        </Button>
      </div>
    </div>
  );
}

function CategoryItem({
  category,
  onOpen,
  children,
}: {
  category: CategoryView;
  onOpen: (open: Open) => void;
  children?: ReactNode;
}) {
  const nameId = useId();
  return (
    <li aria-labelledby={nameId} data-category-id={category.id}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <p className="min-w-0 wrap-anywhere">
          <span id={nameId} className="font-medium">
            {category.name}
          </span>
          {category.isPaycheck ? (
            <span className="ml-2 text-sm text-text-muted">
              {t('settings.categories.paycheckBadge')}
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {category.parentId === null ? (
            <Button
              variant="text"
              size="dense"
              onClick={() => {
                onOpen({ kind: 'create', parentId: category.id });
              }}
            >
              {t('settings.categories.addChild')}
              <span className="sr-only"> {category.name}</span>
            </Button>
          ) : null}
          <Button
            variant="outlined"
            size="dense"
            data-action="edit"
            onClick={() => {
              onOpen({ kind: 'edit', category });
            }}
          >
            {t('settings.rename')}
            <span className="sr-only"> {category.name}</span>
          </Button>
          <Button
            variant="outlined"
            size="dense"
            onClick={() => {
              onOpen({ kind: 'delete', category });
            }}
          >
            {t('settings.delete')}
            <span className="sr-only"> {category.name}</span>
          </Button>
        </div>
      </div>
      {children}
    </li>
  );
}

// Two-level categories (FR-L7): add, rename, and delete, which merges a
// category that entries use into another of its kind.
export function CategoriesSection({
  categories,
}: {
  categories: readonly CategoryView[];
}) {
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const tree = categoryTree(categories);
  const close = () => {
    setOpen(null);
  };
  const opening = (next: Open) => {
    setAnnouncement('');
    setOpen(next);
  };
  const title =
    open === null
      ? ''
      : open.kind === 'create'
        ? open.parentId === undefined
          ? t('settings.categories.addTitle')
          : t('settings.categories.addChildTitle', {
              name: categories.find((c) => c.id === open.parentId)?.name ?? '',
            })
        : open.kind === 'edit'
          ? t('settings.categories.editTitle', { name: open.category.name })
          : t('settings.categories.deleteTitle', {
              name: categoryPath(open.category, categories),
            });

  return (
    <Section
      id="categories"
      title={t('settings.categories.title')}
      intro={t('settings.categories.intro')}
    >
      <Button
        className="mt-4"
        onClick={() => {
          opening({ kind: 'create' });
        }}
      >
        <Plus aria-hidden />
        {t('settings.categories.add')}
      </Button>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {CATEGORY_KINDS.map((kind) => (
        <div key={kind} className="mt-6">
          <h3 className="font-semibold">
            {t(`settings.categories.groups.${kind}`)}
          </h3>
          {tree[kind].length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">
              {t('settings.categories.none')}
            </p>
          ) : (
            <ul className="mt-2 divide-y border-y border-outline-variant px-4">
              {tree[kind].map(({ category, children }) => (
                <CategoryItem
                  key={category.id}
                  category={category}
                  onOpen={opening}
                >
                  {children.length === 0 ? null : (
                    <ul className="mb-2 ml-4 border-l pl-4">
                      {children.map((child) => (
                        <CategoryItem
                          key={child.id}
                          category={child}
                          onOpen={opening}
                        />
                      ))}
                    </ul>
                  )}
                </CategoryItem>
              ))}
            </ul>
          )}
        </div>
      ))}

      <Sheet
        open={open !== null}
        title={title}
        busy={busy}
        onClose={close}
        fallback={() => document.getElementById('categories-title')}
      >
        {open?.kind === 'create' ? (
          <CreateCategoryForm
            categories={categories}
            parentId={open.parentId}
            onBusyChange={setBusy}
            onDone={(name) => {
              close();
              setAnnouncement(t('settings.categories.added', { name }));
            }}
          />
        ) : open?.kind === 'edit' ? (
          <EditCategoryForm
            category={open.category}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={() => {
              close();
              setAnnouncement(t('settings.saved'));
            }}
          />
        ) : open?.kind === 'delete' ? (
          <DeleteCategoryFlow
            category={open.category}
            categories={categories}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={(merged) => {
              const { name } = open.category;
              close();
              setAnnouncement(
                merged === undefined
                  ? t('settings.categories.deleted', { name })
                  : t('settings.categories.merged', { name, target: merged }),
              );
            }}
          />
        ) : null}
      </Sheet>
    </Section>
  );
}
