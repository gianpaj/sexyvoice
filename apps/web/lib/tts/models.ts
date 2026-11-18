/** Retired catalogs stay in the database for audio history joins. */
const RETIRED_TTS_MODELS: readonly string[] = ['gpro', 'gpro31'];

/** PostgREST value for `.not('model', 'in', ...)`. */
export const RETIRED_TTS_MODELS_FILTER = `(${RETIRED_TTS_MODELS.join(',')})`;

export function isActiveTtsModel(model: string): boolean {
  return !RETIRED_TTS_MODELS.includes(model);
}
