/**
 * Semantic state colors, derived per theme.
 *
 * Inspector expresses four meanings — ok, warning, danger, info — and until now
 * expressed them with 54 different hardcoded Tailwind literals. Two things were
 * wrong with that. They ignored the user's theme, because no state color was in
 * `THEME_CSS_VARIABLES`; and several of them failed WCAG AA against the very
 * backgrounds the shipped themes set, which meant the color carrying "this
 * crashed" could be unreadable.
 *
 * Hand-authoring four ramps across 28 themes would be 112 values to keep
 * correct by hand, in two different registry shapes, forever. So they are
 * derived instead: each theme's background decides the lightness, the meaning
 * decides the hue, and the result is checked against the contrast target rather
 * than hoped at. A new theme gets correct state colors for free.
 *
 * A theme that wants a specific value can still set one — `withSemanticColors`
 * never overwrites a variable the theme already defines.
 *
 * See skills/feather-desktop-app/references/design-rules.md §6.2 (C0).
 */

/**
 * Lives in the package, with the registry it serves, so both apps read one
 * definition. The two apps must not import each other (enforced by
 * `no-restricted-imports`), and hand-porting 211 lines of contrast-solving is
 * how divergence starts. See skills/feather-desktop-app/references/design-rules.md §6.2 (C0).
 */
import type { AuthoredThemeVariables, ThemeVariables } from './registry/types';

/**
 * Hue per meaning, and the saturation to render it at.
 *
 * These are the anchors the whole system reads from: green reads "fine", amber
 * "look at this", red "stop", blue "context". They are held constant across
 * themes on purpose — a user switching theme should not have to relearn what a
 * color means.
 */
const SEMANTIC_HUES = {
  ok: { hue: 152, saturation: 72 },
  warn: { hue: 38, saturation: 86 },
  danger: { hue: 4, saturation: 72 },
  info: { hue: 212, saturation: 68 },
} as const;

export type SemanticState = keyof typeof SEMANTIC_HUES;

/**
 * WCAG AA for body text is 4.5:1. We target higher so that a theme whose card
 * surface differs from its page background still clears the bar on both, and so
 * antialiased small text keeps a margin.
 */
const CONTRAST_TARGET = 5.2;
/** WCAG AA for body text. The theme test asserts every derived value clears it. */
export const CONTRAST_FLOOR = 4.5;

// --- color math -------------------------------------------------------------

type Rgb = { r: number; g: number; b: number };

function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace('#', '');
  // Theme values are occasionally 8-digit with alpha; the alpha is irrelevant
  // for the ground we are measuring against, so it is dropped.
  const solid = hex.length === 8 ? hex.slice(0, 6) : hex;
  const expanded = solid.length === 3 ? solid.replace(/./g, (c) => c + c) : solid;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = light - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colors. Returns 1 for unparseable input. */
export function contrastRatio(a: string, b: string): number {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return 1;
  const [hi, lo] = [relativeLuminance(first), relativeLuminance(second)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- derivation -------------------------------------------------------------

/**
 * Find the lightness at which this hue clears the contrast target against every
 * ground it will render on, searching away from those grounds rather than
 * toward a fixed value.
 *
 * Solving against the page background alone is not enough, and the theme test
 * proves it: a chip draws `--danger` on `--danger-surface`, which is a tint of
 * the same hue and therefore a harder ground than the page. Passing on the
 * background while failing on the chip is the exact class of bug C0 exists to
 * remove, so every ground is solved simultaneously.
 */
function solveForeground(hue: number, saturation: number, grounds: string[]): string {
  const primary = parseHex(grounds[0]);
  if (!primary) return toHex(hslToRgb(hue, saturation, 40));
  const groundIsLight = relativeLuminance(primary) > 0.18;

  let best = toHex(hslToRgb(hue, saturation, groundIsLight ? 30 : 70));
  let bestRatio = 0;

  // 1% steps across the usable range. Exhaustive rather than a binary search,
  // because the worst-case ratio across several grounds is not monotonic in
  // lightness, and the loop is 60 iterations of arithmetic.
  const range = groundIsLight ? { from: 55, to: 4 } : { from: 45, to: 96 };
  const step = groundIsLight ? -1 : 1;

  for (let l = range.from; groundIsLight ? l >= range.to : l <= range.to; l += step) {
    const candidate = toHex(hslToRgb(hue, saturation, l));
    const ratio = Math.min(...grounds.map((ground) => contrastRatio(candidate, ground)));
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
    // Stop at the first value that clears the target on every ground: it is the
    // closest to them, which keeps the color from collapsing to near-black or
    // near-white and losing the hue that carries the meaning.
    if (ratio >= CONTRAST_TARGET) return candidate;
  }

  // Nothing cleared the target on all grounds — return the best available. The
  // theme test reports these so the theme can be given an explicit override.
  return best;
}

/** A tinted ground for chips and banners: the state hue pulled close to the surface. */
function solveSurface(hue: number, ground: string): string {
  const groundRgb = parseHex(ground);
  if (!groundRgb) return toHex(hslToRgb(hue, 30, 95));
  const groundIsLight = relativeLuminance(groundRgb) > 0.18;
  return toHex(hslToRgb(hue, groundIsLight ? 62 : 34, groundIsLight ? 93 : 17));
}

/** A border that reads as belonging to the surface without competing with the text. */
function solveBorder(hue: number, ground: string): string {
  const groundRgb = parseHex(ground);
  if (!groundRgb) return toHex(hslToRgb(hue, 40, 80));
  const groundIsLight = relativeLuminance(groundRgb) > 0.18;
  return toHex(hslToRgb(hue, groundIsLight ? 52 : 38, groundIsLight ? 80 : 30));
}

export type SemanticVariables = Record<string, string>;

/**
 * Derive the twelve semantic variables for one theme.
 *
 * `background` is the ground the foregrounds are solved against. Where a theme's
 * card differs, the higher contrast target gives enough headroom that both
 * clear AA; the theme test asserts this rather than assuming it.
 */
export function deriveSemanticColors(background: string, card?: string): SemanticVariables {
  const derived: SemanticVariables = {};
  for (const [state, { hue, saturation }] of Object.entries(SEMANTIC_HUES)) {
    // The surface and border depend only on how light the ground is, so they
    // are solved first and then become grounds themselves.
    const surface = solveSurface(hue, background);
    const grounds = [background, surface, ...(card ? [card] : [])];
    derived[state] = solveForeground(hue, saturation, grounds);
    derived[`${state}-surface`] = surface;
    derived[`${state}-border`] = solveBorder(hue, background);
  }
  return derived;
}

/**
 * Add the semantic ramps to a theme's variables.
 *
 * Values the theme already defines win, so a theme with a curated palette can
 * opt out of derivation per token.
 */
export function withSemanticColors(variables: AuthoredThemeVariables): ThemeVariables {
  const derived = deriveSemanticColors(variables.background, variables.card);
  const merged = { ...variables } as Record<string, string>;
  for (const [name, value] of Object.entries(derived)) {
    if (!merged[name]) merged[name] = value;
  }
  return merged as ThemeVariables;
}

/**
 * The twelve semantic variable names.
 *
 * Defined here rather than filtered out of an app's token list, so both apps
 * splice the same names in and neither can drift a token the other has.
 */
export const SEMANTIC_VARIABLES = (
  ['ok', 'warn', 'danger', 'info'] as const
).flatMap((state) => [state, `${state}-surface`, `${state}-border`]);

/** True for a variable name the derivation owns. */
export function isSemanticVariable(name: string): boolean {
  return /^(ok|warn|danger|info)(-surface|-border)?$/.test(name);
}
