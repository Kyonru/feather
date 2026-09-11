/**
 * Semantic state colors.
 *
 * The derivation moved to `@feather/ui/theme/semantic` so Studio uses the same
 * one rather than a second copy — the two apps cannot import each other, and
 * hand-porting 211 lines of contrast-solving is how divergence starts. This
 * file stays as the name the rest of Inspector already imports.
 *
 * See V4-ENHANCED.md §4 (C0) and V4-STUDIO.md S5.
 */
import { withSemanticColors as deriveWithSemanticColors } from '@feather/ui/theme/semantic';
import type { AuthoredThemeVariables, ThemeVariables } from './types';

export {
  CONTRAST_FLOOR,
  SEMANTIC_VARIABLES,
  contrastRatio,
  deriveSemanticColors,
  isSemanticVariable,
  relativeLuminance,
  type SemanticState,
  type SemanticVariables,
} from '@feather/ui/theme/semantic';

/**
 * The shared derivation, typed in this app's terms.
 *
 * The package cannot name `ThemeVariables` — it is a different token list in
 * each app — so it returns what it added and the app states what that makes.
 */
export function withSemanticColors(variables: AuthoredThemeVariables): ThemeVariables {
  return deriveWithSemanticColors(variables as Record<string, string>) as unknown as ThemeVariables;
}
