import {
  ACCENT_LIMIT,
  accentNameSchema,
  CANONICAL_HUES,
  completePalette,
  DEFAULT_ROLE_MAP,
  hexColorSchema,
  NEUTRAL_SLOTS,
  paletteSchema,
  resolveTheme,
  themeNameSchema,
  type CanonicalHue,
  type NeutralSlot,
  type Palette,
  type ResolvedTheme,
  type Role,
  type RoleEntry,
  type RoleFailure,
  type ThemeBodyV2,
  type ThemeFileV2,
  type ThemeRoles,
  type ThemeScheme,
} from '@allotr/shared';

// The theme editor's state (ADR 0016) and what it may save: a palette (the
// neutral ramp, named accents and which accent plays each hue) plus the
// roles the theme sets itself. Colours are kept as typed, so a half-entered
// hex value does not jump back; the resolver fits the rest.

export type AccentRow = Readonly<{
  /** Stable while the name is edited. */
  key: string;
  name: string;
  color: string;
}>;

export type ThemeDraft = Readonly<{
  name: string;
  scheme: ThemeScheme;
  family?: string | undefined;
  neutrals: Readonly<Record<NeutralSlot, string>>;
  accents: readonly AccentRow[];
  hues: Readonly<Record<CanonicalHue, string>>;
  /** Only the roles this theme sets; the rest follow the default map. */
  roles: ThemeRoles;
}>;

type ThemeLike = Readonly<{
  name: string;
  scheme: ThemeScheme;
  family?: string | undefined;
  palette: Palette;
  roles?: ThemeRoles | undefined;
}>;

let nextKey = 0;
function accentKey(): string {
  nextKey += 1;
  return `accent-${String(nextKey)}`;
}

/** A new draft from a theme; `name` is empty for a copy. */
export function draftFrom(theme: ThemeLike, name = ''): ThemeDraft {
  return {
    name,
    scheme: theme.scheme,
    family: theme.family,
    neutrals: { ...theme.palette.neutrals },
    accents: Object.entries(theme.palette.accents).map(([accent, color]) => ({
      key: accentKey(),
      name: accent,
      color,
    })),
    hues: { ...theme.palette.hues },
    roles: { ...theme.roles },
  };
}

/** A draft from an imported file, its palette completed. */
export function draftFromFile(file: ThemeFileV2): ThemeDraft {
  return draftFrom(
    {
      ...file,
      palette: completePalette(file.palette, file.scheme),
    },
    file.name,
  );
}

/** Where a problem is, as a JSON Pointer into the theme file. */
export type DraftProblem = Readonly<{ path: string; failure: RoleFailure }>;

export type DraftCheck = Readonly<{
  badNeutrals: readonly NeutralSlot[];
  /** Accent keys whose colour is not a colour. */
  badAccentColors: readonly string[];
  /** Accent keys whose name is malformed or repeated. */
  badAccentNames: readonly string[];
  nameError: boolean;
  /** Null while the palette itself is not valid. */
  resolved: ResolvedTheme | null;
  problems: readonly DraftProblem[];
  /** Set only when the draft can be saved. */
  body: ThemeBodyV2 | null;
}>;

const neutralSlots: readonly string[] = NEUTRAL_SLOTS;

/** The draft's palette, when every colour and name in it is valid. */
export function draftPalette(draft: ThemeDraft): Palette | null {
  const parsed = paletteSchema.safeParse({
    neutrals: draft.neutrals,
    accents: Object.fromEntries(
      draft.accents.map((accent) => [accent.name, accent.color]),
    ),
    hues: draft.hues,
  });
  return parsed.success ? parsed.data : null;
}

export function checkDraft(draft: ThemeDraft): DraftCheck {
  const badNeutrals = NEUTRAL_SLOTS.filter(
    (slot) => !hexColorSchema.safeParse(draft.neutrals[slot]).success,
  );
  const badAccentColors = draft.accents
    .filter((accent) => !hexColorSchema.safeParse(accent.color).success)
    .map((accent) => accent.key);
  const names = draft.accents.map((accent) => accent.name);
  const badAccentNames = draft.accents
    .filter(
      (accent, at) =>
        !accentNameSchema.safeParse(accent.name).success ||
        neutralSlots.includes(accent.name) ||
        names.indexOf(accent.name) !== at,
    )
    .map((accent) => accent.key);
  const name = themeNameSchema.safeParse(draft.name);
  const palette = draftPalette(draft);
  const resolved =
    palette === null
      ? null
      : resolveTheme({ scheme: draft.scheme, palette, roles: draft.roles });
  const problems = (resolved?.failures ?? []).map((failure) => ({
    path:
      draft.roles[failure.role] === undefined
        ? '/palette'
        : `/roles/${failure.role}`,
    failure,
  }));
  const roles = Object.keys(draft.roles).length > 0 ? draft.roles : undefined;
  return {
    badNeutrals,
    badAccentColors,
    badAccentNames,
    nameError: !name.success,
    resolved,
    problems,
    body:
      name.success && palette !== null && problems.length === 0
        ? {
            name: name.data,
            scheme: draft.scheme,
            ...(draft.family === undefined ? {} : { family: draft.family }),
            palette,
            ...(roles === undefined ? {} : { roles }),
          }
        : null,
  };
}

/** A role's entry as the resolver will read it: the draft's, or the default. */
export function roleEntry(draft: ThemeDraft, role: Role): RoleEntry {
  return draft.roles[role] ?? DEFAULT_ROLE_MAP[draft.scheme][role];
}

/** Sets a role's entry; the default entry itself is not stored. */
export function withRole(
  draft: ThemeDraft,
  role: Role,
  entry: RoleEntry | undefined,
): ThemeDraft {
  const rest = Object.fromEntries(
    Object.entries(draft.roles).filter(([key]) => key !== role),
  ) as ThemeRoles;
  const fallback = DEFAULT_ROLE_MAP[draft.scheme][role];
  const same =
    entry !== undefined &&
    entry.slot === fallback.slot &&
    entry.alpha === fallback.alpha &&
    entry.over === fallback.over &&
    (entry.fit ?? 'auto') === (fallback.fit ?? 'auto');
  return {
    ...draft,
    roles: entry === undefined || same ? rest : { ...rest, [role]: entry },
  };
}

/** Adds an accent with a free name; undefined at the limit. */
export function withNewAccent(draft: ThemeDraft): ThemeDraft | undefined {
  if (draft.accents.length >= ACCENT_LIMIT) return undefined;
  const taken = new Set(draft.accents.map((accent) => accent.name));
  let at = draft.accents.length + 1;
  while (taken.has(`accent-${String(at)}`)) at += 1;
  return {
    ...draft,
    accents: [
      ...draft.accents,
      {
        key: accentKey(),
        name: `accent-${String(at)}`,
        color: draft.neutrals.text,
      },
    ],
  };
}

/**
 * Removes an accent. Hues it played move to the first accent left; the
 * palette always keeps one.
 */
export function withoutAccent(draft: ThemeDraft, key: string): ThemeDraft {
  const removed = draft.accents.find((accent) => accent.key === key);
  const accents = draft.accents.filter((accent) => accent.key !== key);
  const [first] = accents;
  if (removed === undefined || first === undefined) return draft;
  const hues = Object.fromEntries(
    CANONICAL_HUES.map((hue) => [
      hue,
      draft.hues[hue] === removed.name ? first.name : draft.hues[hue],
    ]),
  ) as Record<CanonicalHue, string>;
  return { ...draft, accents, hues };
}

/** Renames an accent, and the hues and roles that name it. */
export function withAccentName(
  draft: ThemeDraft,
  key: string,
  name: string,
): ThemeDraft {
  const old = draft.accents.find((accent) => accent.key === key)?.name;
  if (old === undefined) return draft;
  const hues = Object.fromEntries(
    CANONICAL_HUES.map((hue) => [
      hue,
      draft.hues[hue] === old ? name : draft.hues[hue],
    ]),
  ) as Record<CanonicalHue, string>;
  const roles = Object.fromEntries(
    Object.entries(draft.roles).map(([role, entry]) => [
      role,
      entry.slot === old ? { ...entry, slot: name } : entry,
    ]),
  ) as ThemeRoles;
  return {
    ...draft,
    accents: draft.accents.map((accent) =>
      accent.key === key ? { ...accent, name } : accent,
    ),
    hues,
    roles,
  };
}

/** `<input type=color>` needs #rrggbb; a bad value shows as black. */
export function pickerValue(value: string): string {
  if (!hexColorSchema.safeParse(value).success) return '#000000';
  const digits = value.slice(1).toLowerCase();
  return `#${digits.length === 3 ? digits.replace(/./g, '$&$&') : digits}`;
}

/** Fitting moved a role this far or more: the editor says so. */
export const NOTICEABLE_DELTA_L = 0.12;
