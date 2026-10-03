import type { TagView } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type SubmitEvent } from 'react';
import { FieldControl } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/features/accounts/sheet';
import { describeProblem } from '@/lib/problem';
import { createTag, invalidate, renameTag, tagQueryKeys } from '@/lib/settings';
import { t } from '@/messages/t';
import { Section } from './section.tsx';
import { useBusy } from './use-busy.ts';

function useTagChange<A>(run: (args: A) => Promise<TagView>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await invalidate(queryClient, tagQueryKeys);
    },
  });
}

function AddTagForm({ onAdded }: { onAdded: (name: string) => void }) {
  const [name, setName] = useState('');
  const add = useTagChange(createTag);
  const problem = add.isError ? describeProblem(add.error) : null;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    add.mutate(name.trim(), {
      onSuccess: (tag) => {
        setName('');
        onAdded(tag.name);
      },
    });
  }

  return (
    <form
      className="mt-4 flex max-w-md flex-wrap items-end gap-3"
      onSubmit={submit}
      noValidate
    >
      <div className="min-w-48 flex-1">
        <FieldControl
          label={t('settings.tags.newTag')}
          error={problem?.message}
        >
          {(props) => (
            <Input
              {...props}
              name="name"
              value={name}
              maxLength={100}
              autoComplete="off"
              className="h-11 text-base"
              onChange={(e) => {
                setName(e.currentTarget.value);
                if (add.isError) add.reset();
              }}
            />
          )}
        </FieldControl>
      </div>
      <Button type="submit" className="h-11" disabled={add.isPending}>
        {add.isPending ? t('settings.saving') : t('settings.tags.add')}
      </Button>
    </form>
  );
}

function RenameTagForm({
  tag,
  onDone,
  onCancel,
  onBusyChange,
}: {
  tag: TagView;
  onDone: (name: string) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [name, setName] = useState(tag.name);
  const rename = useTagChange((next: string) => renameTag(tag.id, next));
  const problem = rename.isError ? describeProblem(rename.error) : null;
  const busy = rename.isPending;
  useBusy(busy, onBusyChange);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === tag.name) {
      onCancel();
      return;
    }
    rename.mutate(name.trim(), {
      onSuccess: (renamed) => {
        onDone(renamed.name);
      },
    });
  }

  return (
    <form className="mt-6 grid gap-5" onSubmit={submit} noValidate>
      <FieldControl label={t('settings.tags.name')} error={problem?.message}>
        {(props) => (
          <Input
            {...props}
            name="name"
            value={name}
            maxLength={100}
            autoComplete="off"
            className="h-11 text-base"
            onChange={(e) => {
              setName(e.currentTarget.value);
              if (rename.isError) rename.reset();
            }}
          />
        )}
      </FieldControl>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11" disabled={busy}>
          {busy ? t('settings.saving') : t('settings.save')}
        </Button>
        <Button
          type="button"
          variant="outlined"
          className="h-11"
          disabled={busy}
          onClick={onCancel}
        >
          {t('settings.cancel')}
        </Button>
      </div>
    </form>
  );
}

function TagItem({
  tag,
  onRename,
}: {
  tag: TagView;
  onRename: (tag: TagView) => void;
}) {
  const nameId = useId();
  return (
    <li
      aria-labelledby={nameId}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"
    >
      <span id={nameId} className="min-w-0 font-medium wrap-anywhere">
        {tag.name}
      </span>
      <Button
        variant="outlined"
        size="dense"
        onClick={() => {
          onRename(tag);
        }}
      >
        {t('settings.rename')}
        <span className="sr-only"> {tag.name}</span>
      </Button>
    </li>
  );
}

// Free-form tags (FR-L7). Tags cannot be deleted yet; the API has no route
// for it.
export function TagsSection({ tags }: { tags: readonly TagView[] }) {
  const [renaming, setRenaming] = useState<TagView | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const close = () => {
    setRenaming(null);
  };

  return (
    <Section id="tags" title={t('settings.tags.title')}>
      <AddTagForm
        onAdded={(name) => {
          setAnnouncement(t('settings.tags.added', { name }));
        }}
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {tags.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">
          {t('settings.tags.none')}
        </p>
      ) : (
        <ul className="mt-4 divide-y border-y border-outline-variant px-4">
          {tags.map((tag) => (
            <TagItem
              key={tag.id}
              tag={tag}
              onRename={(next) => {
                setAnnouncement('');
                setRenaming(next);
              }}
            />
          ))}
        </ul>
      )}
      <Sheet
        open={renaming !== null}
        title={
          renaming === null
            ? ''
            : t('settings.tags.renameTitle', { name: renaming.name })
        }
        busy={busy}
        onClose={close}
        fallback={() => document.getElementById('tags-title')}
      >
        {renaming === null ? null : (
          <RenameTagForm
            tag={renaming}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={(name) => {
              close();
              setAnnouncement(t('settings.tags.renamed', { name }));
            }}
          />
        )}
      </Sheet>
    </Section>
  );
}
