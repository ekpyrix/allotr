import {
  CUSTOM_THEME_LIMIT,
  PALETTE_THEMES,
  slotPaletteTheme,
  THEME_FAMILIES,
  THEME_SCHEMES,
  toThemeFileV2,
  type CustomThemeView,
  type PaletteTheme,
  type Role,
  type ThemeFamily,
  type ThemeScheme,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Upload } from 'lucide-react';
import { useId, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { selectClass } from '@/components/field';
import { ShortcutsSwitch } from '@/components/shortcuts-switch';
import { ThemeModeSwitch } from '@/components/theme-mode-switch';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { Sheet } from '@/features/accounts/sheet';
import { checkDraft, draftFromFile } from '@/features/themes/draft';
import { familyPair } from '@/features/themes/families';
import { handOffDraft } from '@/features/themes/import-handoff';
import {
  importThemeText,
  type ImportResult,
} from '@/features/themes/importers';
import { failureText } from '@/features/themes/labels';
import { ThemePreview } from '@/features/themes/preview';
import {
  appearanceQuery,
  createTheme,
  deleteTheme,
  importThemeUrl,
  themesQuery,
} from '@/lib/appearance';
import { textField } from '@/lib/form';
import { sessionQuery } from '@/lib/session';
import { effectiveMotion, useDevicePref } from '@/lib/device-prefs';
import { useMediaQuery } from '@/lib/media';
import { ApiError } from '@/lib/api';
import { describeProblem } from '@/lib/problem';
import { resolveScheme } from '@/lib/theme-mode';
import { t } from '@/messages/t';
import { Section } from './section.tsx';
import { useBusy } from './use-busy.ts';

const urlReasons = {
  not_https: t('settings.appearance.urlReasons.not_https'),
  credentials: t('settings.appearance.urlReasons.credentials'),
  not_public: t('settings.appearance.urlReasons.not_public'),
  unresolved: t('settings.appearance.urlReasons.unresolved'),
  redirect: t('settings.appearance.urlReasons.redirect'),
  status: t('settings.appearance.urlReasons.status'),
  too_large: t('settings.appearance.urlReasons.too_large'),
  timeout: t('settings.appearance.urlReasons.timeout'),
  network: t('settings.appearance.urlReasons.network'),
} as const;

// Appearance (FR-W5, spec §11.6): the mode, a theme family for both slots
// (or a flavour per slot), how the app moves and feels on this device, and
// the user's own themes.

const swatchRoles = [
  'canvas',
  'card',
  'text',
  'hero-ok',
  'positive',
  'negative',
  'primary',
] as const satisfies readonly Role[];

function Swatches({ theme }: { theme: PaletteTheme }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-3 overflow-hidden rounded-full border border-outline-variant"
    >
      {swatchRoles.map((role) => (
        <span
          key={role}
          className="flex-1"
          style={{ backgroundColor: theme.resolved.roles[role] }}
        />
      ))}
    </span>
  );
}

/** The scheme the app paints now: the mode, or the device's while System. */
function usePaintedScheme(): ThemeScheme {
  const { mode } = useTheme();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  return resolveScheme(mode, prefersDark);
}

function FamilyCard({
  family,
  scheme,
  name,
  checked,
  onPick,
}: {
  family: ThemeFamily;
  scheme: ThemeScheme;
  name: string;
  checked: boolean;
  onPick: () => void;
}) {
  const pair = familyPair(family);
  const shown = pair[scheme] ?? pair.light ?? pair.dark;
  if (shown === undefined) return null;
  return (
    <label
      data-family={family.id}
      className="pressable grid cursor-pointer gap-3 rounded-xl bg-card p-3 outline-offset-2 has-checked:bg-card-raised has-checked:outline-2 has-checked:outline-primary has-focus-visible:outline-2 has-focus-visible:outline-ring"
    >
      <input
        type="radio"
        name={name}
        value={family.id}
        checked={checked}
        onChange={onPick}
        className="sr-only"
      />
      <ThemePreview roles={shown.resolved.roles} compact />
      <span className="grid gap-1.5 px-1">
        <span className="font-medium">{family.name}</span>
        <Swatches theme={shown} />
      </span>
    </label>
  );
}

function FamilyPicker({ custom }: { custom: readonly PaletteTheme[] }) {
  const { appearance, setSlots } = useTheme();
  const scheme = usePaintedScheme();
  const name = useId();
  const painted = slotPaletteTheme(appearance[scheme], scheme, custom);
  return (
    <fieldset className="mt-6 grid gap-3">
      <legend className="text-title">{t('settings.appearance.family')}</legend>
      <p className="text-text-muted">{t('settings.appearance.familyHint')}</p>
      <div className="grid grid-cols-2 gap-3 medium:grid-cols-3 expanded:grid-cols-4">
        {THEME_FAMILIES.map((family) => (
          <FamilyCard
            key={family.id}
            family={family}
            scheme={scheme}
            name={name}
            checked={painted.family === family.id}
            onPick={() => {
              const pair = familyPair(family);
              setSlots({
                ...(pair.light === undefined ? {} : { light: pair.light.id }),
                ...(pair.dark === undefined ? {} : { dark: pair.dark.id }),
              });
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function SlotSelect({
  scheme,
  custom,
}: {
  scheme: ThemeScheme;
  custom: readonly PaletteTheme[];
}) {
  const { appearance, setSlot } = useTheme();
  const id = useId();
  const current = slotPaletteTheme(appearance[scheme], scheme, custom);
  const themes = [...PALETTE_THEMES, ...custom].filter(
    (theme) => theme.scheme === scheme,
  );
  const schemeName = t(`themes.schemes.${scheme}`).toLowerCase();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {scheme === 'light'
          ? t('settings.appearance.lightTheme')
          : t('settings.appearance.darkTheme')}
      </Label>
      <select
        id={id}
        aria-describedby={`${id}-hint`}
        className={selectClass}
        value={current.id}
        onChange={(e) => {
          setSlot(scheme, e.currentTarget.value);
        }}
      >
        {themes.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {custom.includes(theme)
              ? `${theme.name} · ${t('settings.appearance.custom')}`
              : theme.name}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-label text-text-muted">
        {t('settings.appearance.slotHint', { scheme: schemeName })}
      </p>
    </div>
  );
}

function Customise({ custom }: { custom: readonly PaletteTheme[] }) {
  const { appearance } = useTheme();
  const credited = THEME_SCHEMES.map((scheme) =>
    slotPaletteTheme(appearance[scheme], scheme, custom),
  ).filter(
    (theme, at, all) =>
      theme.credit !== undefined &&
      all.findIndex((other) => other.id === theme.id) === at,
  );
  return (
    <details className="mt-4 rounded-lg border border-outline-variant p-4">
      <summary className="cursor-pointer font-medium">
        {t('settings.appearance.customise')}
      </summary>
      <div className="mt-4 grid gap-4 medium:grid-cols-2">
        <SlotSelect scheme="light" custom={custom} />
        <SlotSelect scheme="dark" custom={custom} />
      </div>
      {credited.length === 0 ? null : (
        <ul
          data-testid="theme-credits"
          className="mt-4 grid gap-2 text-label text-text-muted"
        >
          {credited.map((theme) =>
            theme.credit === undefined ? null : (
              <li key={theme.id}>
                <a
                  href={theme.credit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-6 items-center underline underline-offset-4"
                >
                  {t('settings.appearance.credit', {
                    name: theme.name,
                    author: theme.credit.author,
                    licence: theme.credit.licence,
                  })}
                </a>
              </li>
            ),
          )}
        </ul>
      )}
    </details>
  );
}

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

function DeviceSettings() {
  const [motion, setMotion] = useDevicePref('motion');
  const [haptics, setHaptics] = useDevicePref('haptics');
  const [celebrations, setCelebrations] = useDevicePref('celebrations');
  const [density, setDensity] = useDevicePref('density');
  // From this control's own value, so the switch below follows at once.
  const prefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const effective = effectiveMotion(motion, prefersReduced);
  const ids = useId();
  const still = effective !== 'full';
  return (
    <section aria-labelledby={`${ids}-title`} className="mt-8 grid gap-5">
      <div>
        <h3 id={`${ids}-title`} className="text-title">
          {t('settings.appearance.device.title')}
        </h3>
        <p className="text-text-muted">
          {t('settings.appearance.device.intro')}
        </p>
      </div>
      <div className="grid gap-2">
        <span className="text-label">
          {t('settings.appearance.device.motion')}
        </span>
        <ToggleGroup
          label={t('settings.appearance.device.motion')}
          value={motion}
          onValueChange={setMotion}
          options={[
            { value: 'system', label: t('settings.appearance.device.system') },
            { value: 'full', label: t('settings.appearance.device.full') },
            {
              value: 'reduced',
              label: t('settings.appearance.device.reduced'),
            },
            { value: 'off', label: t('settings.appearance.device.off') },
          ]}
          className="max-w-md"
        />
      </div>
      <div className="grid gap-2">
        <span className="text-label">
          {t('settings.appearance.device.density')}
        </span>
        <ToggleGroup
          label={t('settings.appearance.device.density')}
          value={density}
          onValueChange={setDensity}
          options={[
            {
              value: 'comfortable',
              label: t('settings.appearance.device.comfortable'),
            },
            {
              value: 'compact',
              label: t('settings.appearance.device.compact'),
            },
          ]}
          className="max-w-xs"
        />
      </div>
      {canVibrate() ? (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${ids}-haptics`}>
            {t('settings.appearance.device.haptics')}
          </Label>
          <Switch
            id={`${ids}-haptics`}
            checked={haptics === 'on'}
            onCheckedChange={(on) => {
              setHaptics(on ? 'on' : 'off');
            }}
          />
        </div>
      ) : null}
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${ids}-celebrations`}>
            {t('settings.appearance.device.celebrations')}
          </Label>
          <Switch
            id={`${ids}-celebrations`}
            aria-describedby={`${ids}-celebrations-hint`}
            checked={celebrations === 'on' && !still}
            disabled={still}
            onCheckedChange={(on) => {
              setCelebrations(on ? 'on' : 'off');
            }}
          />
        </div>
        <p
          id={`${ids}-celebrations-hint`}
          className="text-label text-text-muted"
        >
          {still
            ? t('settings.appearance.device.celebrationsOff')
            : t('settings.appearance.device.celebrationsHint')}
        </p>
      </div>
    </section>
  );
}

function fileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug === '' ? 'theme' : slug}.json`;
}

function download(theme: CustomThemeView) {
  const file = toThemeFileV2(theme);
  const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], {
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
  room,
  onImported,
}: {
  userId: string;
  /** How many more custom themes fit. */
  room: number;
  onImported: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inputId = useId();
  const [refused, setRefused] = useState<{
    file: string;
    problems: readonly string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: session } = useQuery(sessionQuery);

  // A family is saved flavour by flavour; one theme opens in the editor.
  async function accept(source: string, result: ImportResult) {
    if (!result.ok) {
      setRefused({ file: source, problems: result.problems });
      return;
    }
    const [single] = result.themes;
    if (result.themes.length === 1 && single !== undefined) {
      handOffDraft(draftFromFile(single));
      void navigate({ to: '/settings/themes/new' });
      return;
    }
    const checks = result.themes.map((theme) =>
      checkDraft(draftFromFile(theme)),
    );
    const problems = checks.flatMap((check, at) =>
      check.problems.map(
        ({ path, failure }) =>
          `${result.themes[at]?.name ?? ''} ${path}: ${failureText(failure)}`,
      ),
    );
    const bodies = checks.flatMap((check) =>
      check.body === null ? [] : [check.body],
    );
    if (problems.length > 0 || bodies.length > room) {
      setRefused({
        file: source,
        problems:
          problems.length > 0
            ? problems
            : [t('settings.appearance.noRoom', { count: bodies.length, room })],
      });
      return;
    }
    try {
      for (const body of bodies) await createTheme(body);
      onImported(
        t('settings.appearance.importedFamily', { count: bodies.length }),
      );
    } catch (error) {
      setRefused({
        file: source,
        problems: [describeProblem(error).message],
      });
    } finally {
      await queryClient.invalidateQueries({
        queryKey: themesQuery(userId).queryKey,
      });
    }
  }

  // A refused or failed fetch says why in words; the server gives the
  // reason at /url.
  function urlProblem(error: unknown): string {
    const [first] =
      error instanceof ApiError ? (error.problem.errors ?? []) : [];
    const reason = first?.path === '/url' ? first.message : undefined;
    return reason !== undefined && Object.hasOwn(urlReasons, reason)
      ? urlReasons[reason as keyof typeof urlReasons]
      : describeProblem(error).message;
  }

  async function run(source: string, read: () => Promise<ImportResult>) {
    setRefused(null);
    setBusy(true);
    try {
      await accept(source, await read());
    } catch (error) {
      setRefused({ file: source, problems: [urlProblem(error)] });
    } finally {
      setBusy(false);
    }
  }

  function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file === undefined) return;
    void run(file.name, async () =>
      importThemeText(await file.text(), file.name),
    );
  }

  function readUrl(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = textField(new FormData(event.currentTarget), 'url');
    if (url === '') return;
    void run(url, async () => ({ ok: true, ...(await importThemeUrl(url)) }));
  }

  return (
    <div className="grid gap-2">
      <label
        htmlFor={inputId}
        className="inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full border border-outline px-4 text-label has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
      >
        <Upload aria-hidden className="size-4" />
        {t('settings.appearance.import')}
        <input
          id={inputId}
          type="file"
          aria-describedby={`${inputId}-hint`}
          className="sr-only"
          disabled={busy}
          onChange={readFile}
        />
      </label>
      <p id={`${inputId}-hint`} className="text-label text-text-muted">
        {t('settings.appearance.importHint')}
      </p>
      {session?.themeUrlImport === true ? (
        <form
          className="mt-2 grid max-w-md gap-2"
          onSubmit={readUrl}
          noValidate
        >
          <Label htmlFor={`${inputId}-url`}>
            {t('settings.appearance.importUrl')}
          </Label>
          <div className="flex gap-2">
            <Input
              id={`${inputId}-url`}
              name="url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://"
              aria-describedby={`${inputId}-url-hint`}
              className="h-11"
            />
            <Button type="submit" variant="tonal" disabled={busy}>
              {busy
                ? t('settings.appearance.fetching')
                : t('settings.appearance.fetch')}
            </Button>
          </div>
          <p id={`${inputId}-url-hint`} className="text-label text-text-muted">
            {t('settings.appearance.importUrlHint')}
          </p>
        </form>
      ) : null}
      <div role="alert" data-testid="import-problems">
        {refused === null ? null : (
          <>
            <p className="text-sm font-medium text-negative">
              {t('settings.appearance.importFailed', { file: refused.file })}
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {refused.problems.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function CustomThemeItem({
  theme,
  palette,
  onDelete,
}: {
  theme: CustomThemeView;
  palette: PaletteTheme | undefined;
  onDelete: (theme: CustomThemeView) => void;
}) {
  const nameId = useId();
  const hidden = <span className="sr-only"> {theme.name}</span>;
  return (
    <li
      aria-labelledby={nameId}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-outline-variant px-4 py-3 last:border-b-0"
    >
      <span className="grid min-w-0 gap-1.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span id={nameId} className="font-medium wrap-anywhere">
            {theme.name}
          </span>
          <span className="text-label text-text-muted">
            {t(`themes.schemes.${theme.scheme}`)}
          </span>
        </span>
        {palette === undefined ? null : <Swatches theme={palette} />}
      </span>
      <span className="flex flex-wrap gap-2">
        <Button asChild variant="outlined" size="dense">
          <Link to="/settings/themes/$id" params={{ id: theme.id }}>
            {t('settings.appearance.edit')}
            {hidden}
          </Link>
        </Button>
        <Button
          variant="outlined"
          size="dense"
          onClick={() => {
            download(theme);
          }}
        >
          {t('settings.appearance.download')}
          {hidden}
        </Button>
        <Button
          variant="outlined"
          size="dense"
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
  theme: CustomThemeView;
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
        <p role="alert" className="text-sm font-medium text-negative">
          {describeProblem(remove.error).message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="danger-tonal"
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
          variant="outlined"
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
  const [deleting, setDeleting] = useState<CustomThemeView | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const full = custom.length >= CUSTOM_THEME_LIMIT;
  const close = () => {
    setDeleting(null);
  };

  return (
    <Section id="appearance" title={t('settings.appearance.title')}>
      <ThemeModeSwitch className="mt-4" />
      <FamilyPicker custom={customPalettes} />
      <Customise custom={customPalettes} />
      <DeviceSettings />
      <section className="mt-8 grid gap-3">
        <h3 className="text-title">{t('settings.appearance.yourThemes')}</h3>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {custom.length === 0 ? (
          <p className="text-text-muted">{t('settings.appearance.noThemes')}</p>
        ) : (
          <>
            <ul className="overflow-hidden border-y border-outline-variant">
              {custom.map((theme) => (
                <CustomThemeItem
                  key={theme.id}
                  theme={theme}
                  palette={customPalettes.find((p) => p.id === theme.id)}
                  onDelete={(next) => {
                    setAnnouncement('');
                    setDeleting(next);
                  }}
                />
              ))}
            </ul>
            <p className="text-label text-text-muted">
              {t('settings.appearance.limit', {
                count: custom.length,
                limit: CUSTOM_THEME_LIMIT,
              })}
            </p>
          </>
        )}
        {full ? null : (
          <div className="grid gap-4">
            <Button asChild className="w-fit">
              <Link to="/settings/themes/new">
                {t('settings.appearance.create')}
              </Link>
            </Button>
            <ImportTheme
              userId={userId}
              room={CUSTOM_THEME_LIMIT - custom.length}
              onImported={setAnnouncement}
            />
          </div>
        )}
      </section>
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
