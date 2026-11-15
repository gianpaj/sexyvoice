import { ModelId } from './models';
import type { SessionConfig } from './session-config';

export const defaultSessionConfig: SessionConfig = {
  maxOutputTokens: null,
  model: ModelId.GROK_VOICE_THINK_FAST_2_0,
  temperature: 0.8,
  voice: 'Ara',
};
