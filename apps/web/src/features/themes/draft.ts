import {
  contrastRatio,
  CONTRAST_MINIMUM,
  hexColorSchema,
  THEME_PAIRS,
  THEME_TOKENS,
  themeNameSchema,
  themeTokensSchema,
  validateTheme,
  type ContrastFailure,
  type NamedTheme,
  type ThemeBody,
  type ThemePair,
  type ThemeScheme,
  type ThemeToken,
} from '@allotr/shared';

// The theme editor's state and what it may save. Colours are kept as typed,
// so a half-entered hex value does not jump back.

export type ThemeDraft = Readonly<{
  name: string;
  scheme: ThemeScheme;
  tokens: Readonly<Record<ThemeToken, string>>;
}>;

export const TOKEN_GROUPS = [
  ['surfaces', ['background', 'plot', 'muted', 'border']],
  ['text', ['foreground', 'muted-foreground']],
  ['money', ['today', 'today-text', 'positive', 'negative', 'over']],
  [
    'controls',
    ['primary', 'primary-foreground', 'input', 'ring', 'destructive'],
  ],
] as const satisfies readonly (readonly [string, readonly ThemeToken[]])[];

/** A new draft from an existing theme; `name` is empty for a copy. */
export function draftFrom(theme: NamedTheme, name = ''): ThemeDraft {
  return { name, scheme: theme.scheme, tokens: { ...theme.tokens } };
}

export type PairResult = ThemePair & { ratio: number; required: number };

export type DraftCheck = Readonly<{
  /** Tokens whose value is not a colour. */
  badTokens: readonly ThemeToken[];
  /** Every pair with its ratio; empty while any token is bad. */
  pairs: readonly PairResult[];
  failures: readonly ContrastFailure[];
  nameError: boolean;
  /** Set only when the draft can be saved. */
  body: ThemeBody | null;
}>;

export function checkDraft(draft: ThemeDraft): DraftCheck {
  const badTokens = THEME_TOKENS.filter(
    (token) => !hexColorSchema.safeParse(draft.tokens[token]).success,
  );
  const name = themeNameSchema.safeParse(draft.name);
  const tokens = themeTokensSchema.safeParse(draft.tokens);
  if (!tokens.success)
    return {
      badTokens,
      pairs: [],
      failures: [],
      nameError: !name.success,
      body: null,
    };
  const failures = validateTheme(tokens.data);
  const pairs = THEME_PAIRS.map((pair) => ({
    ...pair,
    ratio: contrastRatio(
      tokens.data[pair.foreground],
      tokens.data[pair.background],
    ),
    required: CONTRAST_MINIMUM[pair.kind],
  }));
  return {
    badTokens,
    pairs,
    failures,
    nameError: !name.success,
    body:
      name.success && failures.length === 0
        ? { name: name.data, scheme: draft.scheme, tokens: tokens.data }
        : null,
  };
}

/** `<input type=color>` needs #rrggbb; a bad value shows as black. */
export function pickerValue(value: string): string {
  if (!hexColorSchema.safeParse(value).success) return '#000000';
  const digits = value.slice(1).toLowerCase();
  return `#${digits.length === 3 ? digits.replace(/./g, '$&$&') : digits}`;
}
