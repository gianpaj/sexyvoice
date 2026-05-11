import { captureException, captureMessage } from '@sentry/nextjs';
import { get } from '@vercel/edge-config';

import { instructions as fallbackInstructions } from '@/data/default-config';
import { initialInstruction as fallbackInitialInstruction } from '@/data/playground-state';
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

const shouldReportEdgeConfigError = () =>
  process.env.VERCEL_ENV === 'production';

export async function getCallInstructionConfig(): Promise<CallInstructionConfig> {
  if (!process.env.EDGE_CONFIG) {
    if (shouldReportEdgeConfigError()) {
      captureMessage('Edge Config connection string missing.', {
        level: 'warning',
        tags: {
          area: 'edge-config',
          config: 'call-instructions',
        },
      });
    }

    return FALLBACK_CONFIG;
  }

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
    if (shouldReportEdgeConfigError()) {
      captureException(error, {
        extra: {
          message: 'Failed to load "call-instructions" from Edge Config',
        },
      });
    }

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
