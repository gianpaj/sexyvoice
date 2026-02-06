import type { CallLanguage } from '../playground-state';
import { lunaInstructions } from './luna';
import { miyuInstructions } from './miyu';
import { ramonaInstructions } from './ramona';
import { rafalInstructions } from './rafal';

/**
 * Central index for all preset instruction translations.
 *
 * Each preset can have translations for all supported call languages.
 * English is stored in presets.ts as the canonical source.
 * This index provides translations for other languages.
 *
 * Usage:
 *   const translated = getPresetInstructions('ramona', 'es');
 *   // returns Spanish instructions for Ramona, or undefined if not available
 */

export const presetInstructionsMap: Record<
  string,
  Partial<Record<CallLanguage, string>>
> = {
  ramona: ramonaInstructions,
  miyu: miyuInstructions,
  luna: lunaInstructions,
  rafal: rafalInstructions,
};

/**
 * Get translated instructions for a preset in a specific language.
 *
 * Falls back to undefined if the preset or language translation doesn't exist.
 * The caller should use the English instructions from presets.ts as fallback.
 *
 * @param presetId - The ID of the preset (e.g., 'ramona', 'miyu')
 * @param language - The call language code (e.g., 'es', 'de')
 * @returns The translated instructions, or undefined if not found
 */
export function getPresetInstructions(
  presetId: string,
  language: CallLanguage,
): string | undefined {
  return presetInstructionsMap[presetId]?.[language];
}
