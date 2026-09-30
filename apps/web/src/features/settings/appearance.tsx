import {
  CUSTOM_THEME_LIMIT,
  PALETTE_THEMES,
  toThemeFile,
  type CustomTheme,
  type PaletteTheme,
  type Role,
  type ThemeScheme,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId, useState, type ChangeEvent } from 'react';
import { ShortcutsSwitch } from '@/components/shortcuts-switch';
import { ThemeModeSwitch } from '@/components/theme-mode-switch';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/features/accounts/sheet';
import { readThemeFile } from '@/features/themes/import';
import {
  appearanceQuery,
  createTheme,
  deleteTheme,
  themesQuery,
} from '@/lib/appearance';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import { Section } from './section.tsx';
import { useBusy } from './use-busy.ts';

// Mode, the theme for each scheme, and the user's own themes (FR-W5).

const swatchRoles = [
  'canvas',
  'text',
  'hero-ok',
  'positive',
  'negative',
  'primary',
] as const satisfies readonly Role[];

function Swatches({ colors }: { colors: readonly string[] }) {
  return (
    <span aria-hidden="true" className="flex overflow-hidden rounded-xs border">
      {colors.map((color, at) => (
        <span
          key={String(at)}
          className="size-5"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

function roleSwatches(theme: PaletteTheme): string[] {
  return swatchRoles.map((role) => theme.resolved.roles[role]);
}

function SlotPicker({
  scheme,
  custom,
}: {
  scheme: ThemeScheme;
  custom: readonly PaletteTheme[];
}) {
  const { appearance, setSlot } = useTheme();
  const name = useId();
  const hintId = `${name}-hint`;
  const themes = [...PALETTE_THEMES, ...custom].filter(
    (theme) => theme.scheme === scheme,
  );
  const schemeName = t(`themes.schemes.${scheme}`).toLowerCase();
  return (
    <fieldset className="mt-6" aria-describedby={hintId}>
      <legend className="font-medium">
        {scheme === 'light'
          ? t('settings.appearance.lightTheme')
          : t('settings.appearance.darkTheme')}
      </legend>
      <p id={hintId} className="text-sm text-muted-foreground">
        {t('settings.appearance.slotHint', { scheme: schemeName })}
      </p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {themes.map((theme) => (
          <label
            key={theme.id}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 has-checked:bg-plot has-focus-visible:ring-2 has-focus-visible:ring-ring"
          >
            <input
              type="radio"
              name={name}
              value={theme.id}
              checked={appearance[scheme] === theme.id}
              onChange={() => {
                setSlot(scheme, theme.id);
              }}
              className="size-4 accent-primary"
            />
            <Swatches colors={roleSwatches(theme)} />
            <span className="min-w-0 wrap-anywhere">
              {theme.name}
              {PALETTE_THEMES.includes(theme) ? null : (
                <span className="text-muted-foreground">
                  {' '}
                  · {t('settings.appearance.custom')}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function fileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug === '' ? 'theme' : slug}.json`;
}

function download(theme: CustomTheme) {
  const blob = new Blob([`${JSON.stringify(toThemeFile(theme), null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(theme.name);
  link.click();
  URL.revokeObjectURL(url);
}

function ImportTheme({
  userId,
  onImported,
}: {
  userId: string;
  onImported: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [refused, setRefused] = useState<{
    file: string;
    problems: readonly string[];
  } | null>(null);
  const save = useMutation({
    mutationFn: createTheme,
    onSuccess: async (theme) => {
      await queryClient.invalidateQueries({
        queryKey: themesQuery(userId).queryKey,
      });
      onImported(theme.name);
    },
  });

  async function read(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    save.reset();
    setRefused(null);
    if (file === undefined) return;
    const result = readThemeFile(await file.text());
    if (result.ok) save.mutate(result.theme);
    else setRefused({ file: file.name, problems: result.problems });
  }

  const problem = save.isError ? describeProblem(save.error).message : null;
  return (
    <div className="mt-4 grid gap-2">
      <label
        htmlFor={inputId}
        className="w-fit cursor-pointer rounded-md border px-4 py-2 text-sm font-medium has-focus-visible:ring-2 has-focus-visible:ring-ring"
      >
        {t('settings.appearance.import')}
        <input
          id={inputId}
          type="file"
          accept=".json,application/json"
          aria-describedby={`${inputId}-hint`}
          className="sr-only"
          disabled={save.isPending}
          onChange={(event) => {
            void read(event);
          }}
        />
      </label>
      <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
        {t('settings.appearance.importHint')}
      </p>
      <div role="alert" data-testid="import-problems">
        {refused === null ? null : (
          <>
            <p className="text-sm font-medium text-over">
              {t('settings.appearance.importFailed', { file: refused.file })}
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {refused.problems.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
        {problem === null ? null : (
          <p className="text-sm font-medium text-over">{problem}</p>
        )}
      </div>
    </div>
  );
}

function CustomThemeItem({
  theme,
  onDelete,
}: {
  theme: CustomTheme;
  onDelete: (theme: CustomTheme) => void;
}) {
  const nameId = useId();
  const hidden = <span className="sr-only"> {theme.name}</span>;
  return (
    <li
      aria-labelledby={nameId}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"
    >
      <span className="flex min-w-0 items-center gap-3">
        <Swatches
          colors={[
            theme.tokens.background,
            theme.tokens.foreground,
            theme.tokens.today,
            theme.tokens.positive,
            theme.tokens.negative,
            theme.tokens.primary,
          ]}
        />
        <span id={nameId} className="font-medium wrap-anywhere">
          {theme.name}
        </span>
        <span className="text-sm text-muted-foreground">
          {t(`themes.schemes.${theme.scheme}`)}
        </span>
      </span>
      <span className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/settings/themes/$id" params={{ id: theme.id }}>
            {t('settings.appearance.edit')}
            {hidden}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            download(theme);
          }}
        >
          {t('settings.appearance.download')}
          {hidden}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onDelete(theme);
          }}
        >
          {t('settings.appearance.delete')}
          {hidden}
        </Button>
      </span>
    </li>
  );
}

function DeleteTheme({
  theme,
  userId,
  onDone,
  onCancel,
  onBusyChange,
}: {
  theme: CustomTheme;
  userId: string;
  onDone: () => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteTheme(theme.id),
    onSuccess: async () => {
      // The server may have moved a slot back to its default.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: themesQuery(userId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: appearanceQuery(userId).queryKey,
        }),
      ]);
      onDone();
    },
  });
  useBusy(remove.isPending, onBusyChange);
  return (
    <div className="mt-4 grid gap-4">
      <p>{t('settings.appearance.deleteBody')}</p>
      {remove.isError ? (
        <p role="alert" className="text-sm font-medium text-over">
          {describeProblem(remove.error).message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="h-11 border-destructive text-destructive"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate();
          }}
        >
          {remove.isPending
            ? t('settings.saving')
            : t('settings.appearance.delete')}
        </Button>
        <Button
          variant="outline"
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

export function AppearanceSection({ userId }: { userId: string }) {
  const { customThemes, customPalettes } = useTheme();
  const custom = customThemes ?? [];
  const [deleting, setDeleting] = useState<CustomTheme | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const full = custom.length >= CUSTOM_THEME_LIMIT;
  const close = () => {
    setDeleting(null);
  };

  return (
    <Section id="appearance" title={t('settings.appearance.title')}>
      <ThemeModeSwitch className="mt-4" />
      <SlotPicker scheme="light" custom={customPalettes} />
      <SlotPicker scheme="dark" custom={customPalettes} />
      <h3 className="mt-8 font-medium">
        {t('settings.appearance.yourThemes')}
      </h3>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {custom.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t('settings.appearance.noThemes')}
        </p>
      ) : (
        <>
          <ul className="mt-2 divide-y rounded-md bg-plot px-4">
            {custom.map((theme) => (
              <CustomThemeItem
                key={theme.id}
                theme={theme}
                onDelete={(next) => {
                  setAnnouncement('');
                  setDeleting(next);
                }}
              />
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('settings.appearance.limit', {
              count: custom.length,
              limit: CUSTOM_THEME_LIMIT,
            })}
          </p>
        </>
      )}
      {full ? null : (
        <>
          <Button asChild className="mt-4 h-11">
            <Link to="/settings/themes/new">
              {t('settings.appearance.create')}
            </Link>
          </Button>
          <ImportTheme
            userId={userId}
            onImported={(name) => {
              setAnnouncement(t('settings.appearance.imported', { name }));
            }}
          />
        </>
      )}
      <ShortcutsSwitch className="mt-8" />
      <Sheet
        open={deleting !== null}
        title={
          deleting === null
            ? ''
            : t('settings.appearance.deleteTitle', { name: deleting.name })
        }
        busy={busy}
        onClose={close}
        fallback={() => document.getElementById('appearance-title')}
      >
        {deleting === null ? null : (
          <DeleteTheme
            theme={deleting}
            userId={userId}
            onBusyChange={setBusy}
            onCancel={close}
            onDone={() => {
              setAnnouncement(
                t('settings.appearance.deleted', { name: deleting.name }),
              );
              close();
            }}
          />
        )}
      </Sheet>
    </Section>
  );
}
