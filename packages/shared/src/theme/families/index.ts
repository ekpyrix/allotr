import catppuccin from './catppuccin.json' with { type: 'json' };
import dracula from './dracula.json' with { type: 'json' };
import gruvbox from './gruvbox.json' with { type: 'json' };
import nord from './nord.json' with { type: 'json' };
import rosePine from './rose-pine.json' with { type: 'json' };
import solarized from './solarized.json' with { type: 'json' };
import tokyoNight from './tokyo-night.json' with { type: 'json' };

// Third-party palette families shipped under their own names (ADR 0017),
// each a list of v2 theme files, light flavours first. Their licences are
// in THIRD_PARTY_NOTICES.md. Hexes are copied from the upstream source
// named below and pinned by the golden test; upstream changes are pulled
// on purpose, never automatically. Neutral slots a family has no colour
// for are left out and derived by completePalette; so are canonical hues
// with no native accent.
//
// Catppuccin (palette.json v1.8.0): every neutral and accent is native.
//   Hues: orange peach, cyan teal, purple mauve.
// Nord (src/nord.css): dark only upstream.
//   base nord0, surface0–2 nord1–3, subtext0 nord4, subtext1 nord5,
//   text nord6; accents nord7–nord15. Hues: red nord11, orange nord12,
//   yellow nord13, green nord14, cyan nord8, blue nord9, purple nord15.
// Solarized (README table), mirrored between schemes:
//   light: base base3, surface0 base2, overlay0 base1, overlay2 base0,
//   subtext0 base00, text base01; dark: base base03, surface0 base02,
//   overlay0 base01, overlay2 base00, subtext0 base0, text base1.
//   Hues: purple violet, pink magenta.
// Gruvbox (colors/gruvbox.vim, medium contrast): light uses the faded
//   accents, dark the bright ones.
//   light: base light0, surface0–2 light1–3, overlay0 light4, overlay1
//   gray, subtext0 dark4, subtext1 dark3, text dark1; dark: mantle
//   dark0_hard, base dark0, surface0–2 dark1–3, overlay0 dark4, overlay1
//   gray, subtext0 light4, subtext1 light3, text light1.
//   Hues: cyan aqua, pink purple.
// Dracula (README tables): Alucard is the light flavour.
//   base Background, surface0 Selection (Alucard) or Current Line
//   (Dracula), subtext0 (Alucard) or overlay1 (Dracula) Comment, text
//   Foreground. Blue is derived.
// Tokyo Night (extras/lua/tokyonight_<style>.lua): crust bg_dark1, mantle
//   bg_dark, base bg, surface0 bg_highlight, surface1 fg_gutter, surface2
//   terminal_black, overlay0 dark3, overlay1 comment, overlay2 dark5,
//   subtext0 fg_dark, text fg. Hues: purple magenta; pink is derived.
// Rosé Pine (palette.json): light: base base, surface0 overlay; dark:
//   base base, surface0 surface, surface1 overlay; both: overlay1 muted,
//   subtext0 subtle, text text. Hues: red love, orange and yellow gold,
//   cyan foam, blue pine, purple iris, pink rose; green is derived.

/** Family id → its theme files, in picker order. */
export const FAMILY_FILES: Readonly<Record<string, readonly unknown[]>> = {
  catppuccin,
  nord,
  solarized,
  gruvbox,
  dracula,
  'tokyo-night': tokyoNight,
  'rose-pine': rosePine,
};
