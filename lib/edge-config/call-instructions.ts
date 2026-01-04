import { captureException } from '@sentry/nextjs';
import { get } from '@vercel/edge-config';

import {
  initialInstruction as fallbackInitialInstruction,
  instructions as fallbackInstructions,
} from '@/data/playground-state';
import type { Preset } from '@/data/presets';

interface CallInstructionConfig {
  defaultInstructions: string;
  initialInstruction: string;
  presetInstructions?: Record<string, string>;
}

const FALLBACK_CONFIG: CallInstructionConfig = {
  defaultInstructions: fallbackInstructions,
  initialInstruction: fallbackInitialInstruction,
};

export async function getCallInstructionConfig(): Promise<CallInstructionConfig> {
  try {
    const config =
      await get<Partial<CallInstructionConfig>>('call-instructions');

    return {
      defaultInstructions: config?.defaultInstructions ?? fallbackInstructions,
      initialInstruction:
        config?.initialInstruction ?? fallbackInitialInstruction,
      presetInstructions: config?.presetInstructions,
    };
  } catch (error) {
    captureException(error, {
      data: {
        message: 'Failed to load call instructions from Edge Config',
      },
    });

    return FALLBACK_CONFIG;
  }
}

export function applyPresetInstructionOverrides(
  presets: Preset[],
  presetInstructions?: Record<string, string>,
): Preset[] {
  if (!presetInstructions) {
    return presets;
  }

  return presets.map((preset) => ({
    ...preset,
    instructions: presetInstructions[preset.id] ?? preset.instructions,
  }));
}
