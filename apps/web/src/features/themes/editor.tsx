import {
  ACCENT_LIMIT,
  CANONICAL_HUES,
  contrastRatio,
  CONTRAST_MINIMUM,
  formatContrastRatio,
  NEUTRAL_SLOTS,
  ROLE_SPECS,
  THEME_SCHEMES,
  type CustomThemeView,
  type PaletteTheme,
  type ResolvedTheme,
  type Role,
  type ThemeBodyV2,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Check, Plus, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsPanel } from '@/components/ui/tabs';
import {
  appearanceQuery,
  createTheme,
  themesQuery,
  updateTheme,
} from '@/lib/appearance';
import { describeProblem } from '@/lib/problem';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import {
  checkDraft,
  draftFrom,
  NOTICEABLE_DELTA_L,
  pickerValue,
  roleEntry,
  withAccentName,
  withNewAccent,
  withoutAccent,
  withRole,
  type DraftCheck,
  type ThemeDraft,
} from './draft.ts';
import { failureText, ROLE_GROUPS, roleLabel } from './labels.ts';
import { ThemePreview } from './preview.tsx';

// The theme editor (ADR 0016, spec §11.6): a palette tab (the neutral ramp,
// named accents and the hue index) and a roles tab (which palette colour
// each role takes, and whether it may be adjusted for contrast), beside a
// live preview. The resolver fits every role it may; what it cannot fit is
// listed with where in the theme file it comes from, and blocks saving.

function ColorField({
  label,
  value,
  bad,
  name,
  onChange,
}: {
  label: string;
  value: string;
  bad: boolean;
  name: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldControl label={label} error={bad ? t('themes.badHex') : undefined}>
      {(props) => (
        <div className="flex gap-2">
          <input
            type="color"
            aria-label={t('themes.picker', { name: label })}
            value={pickerValue(value)}
            onChange={(e) => {
              onChange(e.currentTarget.value);
            }}
            className="h-11 w-12 shrink-0 cursor-pointer rounded-md border border-outline bg-card p-1"
          />
          <Input
            {...props}
            name={name}
            value={value}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            maxLength={7}
            className="h-11 font-mono"
            onChange={(e) => {
              onChange(e.currentTarget.value.trim());
            }}
          />
        </div>
      )}
    </FieldControl>
  );
}

function PaletteTab({
  draft,
  check,
  onChange,
}: {
  draft: ThemeDraft;
  check: DraftCheck;
  onChange: (next: ThemeDraft) => void;
}) {
  const huesId = useId();
  const added = withNewAccent(draft);
  return (
    <div className="grid gap-8">
      <fieldset className="grid gap-3">
        <legend className="text-title">{t('themes.neutrals')}</legend>
        <p className="text-text-muted">{t('themes.neutralsHint')}</p>
        <div
          aria-hidden="true"
          data-testid="neutral-strip"
          className="flex h-6 overflow-hidden rounded-md border border-outline-variant"
        >
          {NEUTRAL_SLOTS.map((slot) => (
            <span
              key={slot}
              className="flex-1"
              style={{ backgroundColor: pickerValue(draft.neutrals[slot]) }}
            />
          ))}
        </div>
        <div className="grid gap-4 medium:grid-cols-2 expanded:grid-cols-3">
          {NEUTRAL_SLOTS.map((slot) => (
            <ColorField
              key={slot}
              label={slot}
              name={`neutral-${slot}`}
              value={draft.neutrals[slot]}
              bad={check.badNeutrals.includes(slot)}
              onChange={(value) => {
                onChange({
                  ...draft,
                  neutrals: { ...draft.neutrals, [slot]: value },
                });
              }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="text-title">{t('themes.accents')}</legend>
        <p className="text-text-muted">
          {t('themes.accentsHint', { limit: ACCENT_LIMIT })}
        </p>
        <ul className="grid gap-4">
          {draft.accents.map((accent) => (
            <li
              key={accent.key}
              className="grid items-start gap-3 rounded-lg bg-card-raised p-3 medium:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <FieldControl
                label={t('themes.accentName')}
                error={
                  check.badAccentNames.includes(accent.key)
                    ? t('themes.badAccentName')
                    : undefined
                }
              >
                {(props) => (
                  <Input
                    {...props}
                    value={accent.name}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    maxLength={24}
                    className="h-11 font-mono"
                    onChange={(e) => {
                      onChange(
                        withAccentName(
                          draft,
                          accent.key,
                          e.currentTarget.value.trim().toLowerCase(),
                        ),
                      );
                    }}
                  />
                )}
              </FieldControl>
              <ColorField
                label={t('themes.colour', { name: accent.name })}
                name={`accent-${accent.key}`}
                value={accent.color}
                bad={check.badAccentColors.includes(accent.key)}
                onChange={(color) => {
                  onChange({
                    ...draft,
                    accents: draft.accents.map((a) =>
                      a.key === accent.key ? { ...a, color } : a,
                    ),
                  });
                }}
              />
              <IconButton
                type="button"
                aria-label={t('themes.removeAccent', { name: accent.name })}
                disabled={draft.accents.length <= 1}
                className="medium:mt-7"
                onClick={() => {
                  onChange(withoutAccent(draft, accent.key));
                }}
              >
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
        {added === undefined ? null : (
          <Button
            type="button"
            variant="tonal"
            className="w-fit"
            onClick={() => {
              onChange(added);
            }}
          >
            <Plus aria-hidden />
            {t('themes.addAccent')}
          </Button>
        )}
      </fieldset>

      <fieldset className="grid gap-3" aria-describedby={huesId}>
        <legend className="text-title">{t('themes.hues')}</legend>
        <p id={huesId} className="text-text-muted">
          {t('themes.huesHint')}
        </p>
        <div className="grid gap-4 medium:grid-cols-2 expanded:grid-cols-4">
          {CANONICAL_HUES.map((hue) => (
            <div key={hue} className="grid gap-2">
              <Label htmlFor={`${huesId}-${hue}`}>
                {t(`themes.hueNames.${hue}`)}
              </Label>
              <select
                id={`${huesId}-${hue}`}
                className={selectClass}
                value={draft.hues[hue]}
                onChange={(e) => {
                  onChange({
                    ...draft,
                    hues: { ...draft.hues, [hue]: e.currentTarget.value },
                  });
                }}
              >
                {draft.accents.map((accent) => (
                  <option key={accent.key} value={accent.name}>
                    {accent.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block size-8 rounded-sm', className)}
      style={{ backgroundColor: color }}
    />
  );
}

function RoleRow({
  role,
  draft,
  resolved,
  slots,
  onChange,
}: {
  role: Role;
  draft: ThemeDraft;
  resolved: ResolvedTheme | null;
  slots: readonly string[];
  onChange: (next: ThemeDraft) => void;
}) {
  const id = useId();
  const entry = roleEntry(draft, role);
  const spec = ROLE_SPECS[role];
  const need =
    spec.kind === 'surface' || spec.kind === 'decorative'
      ? undefined
      : CONTRAST_MINIMUM[spec.kind];
  const content = need !== undefined;
  const fit = resolved?.fitted[role];
  const color = resolved?.roles[role];
  const label = roleLabel(role);
  const options = slots.includes(entry.slot) ? slots : [entry.slot, ...slots];
  return (
    <li
      data-role={role}
      className="grid gap-3 border-b border-outline-variant py-4 last:border-b-0"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          data-testid={fit === undefined ? undefined : 'split-swatch'}
          className="flex overflow-hidden rounded-sm border border-outline-variant"
        >
          {fit === undefined ? null : <Swatch color={fit.from} />}
          {color === undefined ? null : <Swatch color={color} />}
        </span>
        <Label htmlFor={`${id}-slot`} className="min-w-32 flex-1">
          {label}
        </Label>
        <select
          id={`${id}-slot`}
          aria-label={t('themes.slot', { role: label })}
          className={cn(selectClass, 'w-auto min-w-36')}
          value={entry.slot}
          onChange={(e) => {
            onChange(
              withRole(draft, role, { ...entry, slot: e.currentTarget.value }),
            );
          }}
        >
          {options.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
        {content ? (
          <span className="flex items-center gap-2">
            <Switch
              id={`${id}-fit`}
              aria-label={t('themes.fit', { role: label })}
              checked={entry.fit !== 'off'}
              onCheckedChange={(on) => {
                onChange(
                  withRole(draft, role, { ...entry, fit: on ? 'auto' : 'off' }),
                );
              }}
            />
            <span aria-hidden="true" className="text-label text-text-muted">
              {t('themes.fitShort')}
            </span>
          </span>
        ) : null}
        {draft.roles[role] === undefined ? null : (
          <Button
            type="button"
            variant="text"
            size="dense"
            onClick={() => {
              onChange(withRole(draft, role, undefined));
            }}
          >
            <Undo2 aria-hidden />
            {t('themes.resetShort')}
            <span className="sr-only"> {label}</span>
          </Button>
        )}
      </div>
      {fit === undefined ? null : (
        <p className="text-label text-text-muted">
          {t('themes.fitted', {
            from: fit.from,
            to: fit.to,
            delta: fit.deltaL.toPrecision(2),
          })}
          {fit.deltaL >= NOTICEABLE_DELTA_L ? (
            <span className="mt-1 flex items-start gap-1.5 text-text">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('themes.noticeable')}
            </span>
          ) : null}
        </p>
      )}
      {need !== undefined && resolved !== null && color !== undefined ? (
        <ul className="flex flex-wrap gap-2">
          {spec.on.map((surface) => {
            const ratio = contrastRatio(color, resolved.roles[surface]);
            const pass = ratio >= need;
            return (
              <li
                key={surface}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption',
                  pass
                    ? 'bg-card-raised'
                    : 'bg-danger-container text-on-danger-container',
                )}
              >
                {pass ? (
                  <Check aria-hidden className="size-3.5" />
                ) : (
                  <TriangleAlert aria-hidden className="size-3.5" />
                )}
                {t('themes.ratioOn', {
                  ratio: formatContrastRatio(ratio),
                  surface: roleLabel(surface),
                })}
                <span className="sr-only">
                  {' '}
                  {pass ? t('themes.ratioPass') : t('themes.ratioFail')}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function RolesTab({
  draft,
  check,
  onChange,
}: {
  draft: ThemeDraft;
  check: DraftCheck;
  onChange: (next: ThemeDraft) => void;
}) {
  const slots = [
    ...NEUTRAL_SLOTS,
    ...CANONICAL_HUES,
    ...draft.accents
      .map((accent) => accent.name)
      .filter((name) => !(CANONICAL_HUES as readonly string[]).includes(name)),
  ];
  if (check.resolved === null)
    return <p className="text-text-muted">{t('themes.fixPalette')}</p>;
  return (
    <div className="grid gap-8">
      {ROLE_GROUPS.map(([group, roles]) => (
        <section key={group} className="grid gap-1">
          <h3 className="text-title">{t(`themes.groups.${group}`)}</h3>
          <ul>
            {roles.map((role) => (
              <RoleRow
                key={role}
                role={role}
                draft={draft}
                resolved={check.resolved}
                slots={slots}
                onChange={onChange}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ContrastPanel({ check }: { check: DraftCheck }) {
  const headingId = useId();
  const adjusted = Object.keys(check.resolved?.fitted ?? {}).length;
  const summary =
    check.resolved === null
      ? t('themes.fixPalette')
      : check.problems.length > 0
        ? t('themes.failing', { count: check.problems.length })
        : adjusted === 0
          ? t('themes.allPass')
          : `${t('themes.allPass')} ${t('themes.adjusted', { count: adjusted })}`;
  const bad = check.resolved === null || check.problems.length > 0;
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h2 id={headingId} className="text-title">
        {t('themes.contrast')}
      </h2>
      {/* Only the summary is announced, not every role on every change. */}
      <p aria-live="polite" className="sr-only">
        {summary}
      </p>
      <p
        data-testid="contrast-summary"
        className={bad ? 'font-medium text-negative' : 'text-text'}
      >
        {summary}
      </p>
      {check.problems.length > 0 ? (
        <ul data-testid="contrast-failures" className="grid gap-1 text-sm">
          {check.problems.map(({ path, failure }) => (
            <li
              key={`${path}-${failure.role}-${failure.reason === 'contrast' ? failure.surface : failure.slot}`}
            >
              <code className="font-mono text-text-muted">{path}</code>{' '}
              {failureText(failure)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type Start = Pick<
  PaletteTheme,
  'id' | 'name' | 'scheme' | 'family' | 'palette' | 'roles'
>;

export function ThemeEditor({
  userId,
  initial,
  editing,
  starts,
  startId,
}: {
  userId: string;
  initial: ThemeDraft;
  editing?: CustomThemeView | undefined;
  starts: readonly Start[];
  startId?: string | undefined;
}) {
  const [draft, setDraft] = useState(initial);
  const [start, setStart] = useState(startId ?? '');
  const [tab, setTab] = useState<'palette' | 'roles'>('palette');
  const [attempted, setAttempted] = useState(false);
  const check = checkDraft(draft);
  const { setSlot } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const save = useMutation({
    mutationFn: (body: ThemeBodyV2) =>
      editing === undefined ? createTheme(body) : updateTheme(editing.id, body),
    onSuccess: async () => {
      // A scheme change can move the theme out of its slot on the server.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: themesQuery(userId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: appearanceQuery(userId).queryKey,
        }),
      ]);
    },
  });
  const problem = save.isError ? describeProblem(save.error) : null;
  const ids = useId();

  function change(next: ThemeDraft) {
    setDraft(next);
    if (save.isError) save.reset();
  }

  // Saving is refused here, not by disabling the buttons, so the reason is
  // given where the person looks.
  function submit(use: boolean) {
    setAttempted(true);
    if (check.body === null) return;
    save.mutate(check.body, {
      onSuccess: (theme) => {
        if (use) setSlot(theme.scheme, theme.id);
        void navigate({ to: '/settings', hash: 'appearance' });
      },
    });
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(false);
  }

  let blocked: string | null = null;
  if (attempted && check.body === null)
    blocked = check.nameError
      ? t('themes.nameRequired')
      : check.resolved === null
        ? t('themes.fixPalette')
        : t('themes.fixFirst');

  const busy = save.isPending;

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="mt-6 grid gap-8 expanded:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
    >
      <div className="grid min-w-0 content-start gap-6">
        <FieldControl
          label={t('themes.name')}
          error={
            attempted && check.nameError ? t('themes.nameRequired') : undefined
          }
        >
          {(props) => (
            <Input
              {...props}
              name="name"
              value={draft.name}
              maxLength={40}
              autoComplete="off"
              className="h-11"
              onChange={(e) => {
                change({ ...draft, name: e.currentTarget.value });
              }}
            />
          )}
        </FieldControl>
        {editing === undefined ? (
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-start`}>{t('themes.startFrom')}</Label>
            <select
              id={`${ids}-start`}
              className={selectClass}
              value={start}
              onChange={(e) => {
                const id = e.currentTarget.value;
                const theme = starts.find((s) => s.id === id);
                setStart(id);
                if (theme !== undefined) change(draftFrom(theme, draft.name));
              }}
            >
              {starts.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name} ({t(`themes.schemes.${theme.scheme}`)})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <fieldset>
          <legend className="text-label">{t('themes.scheme')}</legend>
          <div className="mt-2 flex gap-6">
            {THEME_SCHEMES.map((scheme) => (
              <label key={scheme} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={`${ids}-scheme`}
                  value={scheme}
                  checked={draft.scheme === scheme}
                  onChange={() => {
                    change({ ...draft, scheme });
                  }}
                  className="size-4 accent-primary"
                />
                {t(`themes.schemes.${scheme}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Tabs
          label={t('themes.tabs.label')}
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: 'palette', label: t('themes.tabs.palette') },
            { value: 'roles', label: t('themes.tabs.roles') },
          ]}
        >
          <TabsPanel value="palette">
            <PaletteTab draft={draft} check={check} onChange={change} />
          </TabsPanel>
          <TabsPanel value="roles">
            <RolesTab draft={draft} check={check} onChange={change} />
          </TabsPanel>
        </Tabs>
      </div>
      <div className="grid content-start gap-4 expanded:sticky expanded:top-20 expanded:self-start">
        <h2 className="text-title">{t('themes.preview')}</h2>
        {check.resolved === null ? null : (
          <ThemePreview roles={check.resolved.roles} testId="theme-preview" />
        )}
        <ContrastPanel check={check} />
        <FormError message={problem?.message ?? blocked} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? t('themes.saving') : t('themes.save')}
          </Button>
          <Button
            type="button"
            variant="outlined"
            disabled={busy}
            onClick={() => {
              submit(true);
            }}
          >
            {t('themes.saveAndUse')}
          </Button>
          <Button asChild variant="text">
            <Link to="/settings" hash="appearance">
              {t('themes.cancel')}
            </Link>
          </Button>
        </div>
      </div>
    </form>
  );
}
