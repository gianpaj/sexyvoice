'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

/**
 * How the generate page decides whether to use the streaming (SSE) path for
 * Gemini 3.1 (gpro31) voices. `auto` keeps the length-based heuristic; `on` and
 * `off` are explicit user overrides.
 */
export type StreamMode = 'auto' | 'on' | 'off';

/**
 * User-tunable "advanced" generation settings surfaced in the right-hand panel.
 * All values are provider-specific and default to a sentinel that means "let the
 * backend decide" so the request payload stays minimal unless a user opts in.
 */
export interface GenerationSettings {
  /** Fixed Gemini seed for reproducible output. `null` = random each run. */
  seed: number | null;
  /** Grok speech speed multiplier (0.7–1.5). `null` = default (1.0). */
  speed: number | null;
  /** Streaming override for gpro31 voices. */
  streamMode: StreamMode;
  /** Gemini sampling temperature (0–2). `null` = model default. */
  temperature: number | null;
}

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  seed: null,
  streamMode: 'auto',
  temperature: null,
  speed: null,
};

const STORAGE_KEY = 'generation-settings';

export interface UseGenerationSettingsResult {
  resetSettings: () => void;
  settings: GenerationSettings;
  updateSettings: (patch: Partial<GenerationSettings>) => void;
}

/**
 * Persists the advanced generation settings to localStorage (device-only) and
 * exposes a small patch/reset API. Merges the stored value over the defaults so
 * older persisted shapes that predate a newer key stay valid.
 */
export function useGenerationSettings(): UseGenerationSettingsResult {
  const [stored, setStored] = useLocalStorage<GenerationSettings>(
    STORAGE_KEY,
    DEFAULT_GENERATION_SETTINGS,
  );

  const settings: GenerationSettings = {
    ...DEFAULT_GENERATION_SETTINGS,
    ...stored,
  };

  const updateSettings = (patch: Partial<GenerationSettings>) => {
    setStored((prev) => ({
      ...DEFAULT_GENERATION_SETTINGS,
      ...prev,
      ...patch,
    }));
  };

  const resetSettings = () => setStored(DEFAULT_GENERATION_SETTINGS);

  return { settings, updateSettings, resetSettings };
}
