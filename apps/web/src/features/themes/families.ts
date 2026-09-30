import {
  findPaletteTheme,
  toOklch,
  type PaletteTheme,
  type ThemeFamily,
  type ThemeScheme,
} from '@allotr/shared';

// A family's default pair (ADR 0017): its lightest light flavour and its
// darkest dark one, which is how families name their main flavours. A
// family without one of the schemes leaves that slot as it is.

function canvasL(theme: PaletteTheme): number {
  return toOklch(theme.palette.neutrals.base).l;
}

export function familyThemes(family: ThemeFamily): PaletteTheme[] {
  return family.themes
    .map((id) => findPaletteTheme(id, []))
    .filter((theme) => theme !== undefined);
}

export function familyPair(
  family: ThemeFamily,
): Partial<Record<ThemeScheme, PaletteTheme>> {
  const themes = familyThemes(family);
  const pick = (
    scheme: ThemeScheme,
    better: (a: number, b: number) => boolean,
  ) =>
    themes
      .filter((theme) => theme.scheme === scheme)
      .reduce<PaletteTheme | undefined>(
        (best, theme) =>
          best === undefined || better(canvasL(theme), canvasL(best))
            ? theme
            : best,
        undefined,
      );
  const light = pick('light', (a, b) => a > b);
  const dark = pick('dark', (a, b) => a < b);
  return {
    ...(light === undefined ? {} : { light }),
    ...(dark === undefined ? {} : { dark }),
  };
}
