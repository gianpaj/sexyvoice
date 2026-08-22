import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { callScenes } from '@/data/call-scenes';
import { callTokenPlaygroundStateSchema } from '@/lib/call-token-schema';

// Type for z.treeifyError() return value
interface TreeifiedError {
  errors: string[];
  properties?: Record<
    string,
    {
      errors: string[];
      properties?: Record<string, TreeifiedError>;
    }
  >;
}

// Test the Zod schema validation for call-token API
describe('call-token API validation', () => {
  // Helper to get treeified error (matching what API returns)
  const getTreeifiedError = (error: z.ZodError): TreeifiedError =>
    z.treeifyError(error) as TreeifiedError;
  const playgroundStateSchema = callTokenPlaygroundStateSchema;

  describe('valid payloads', () => {
    it('should accept a minimal valid payload', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('upgrades a retired model id instead of forwarding it to the agent', () => {
      // A stale tab or a shared URL can still post 1.0. Forwarding it verbatim
      // would run the old model while charging the current rate.
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data?.sessionConfig.model).toBe(
        'grok-voice-think-fast-1.0',
      );
    });

    it('falls back to the default for an unknown model id', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'totally-made-up-model',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data?.sessionConfig.model).toBe(
        'grok-voice-think-fast-1.0',
      );
    });

    it('should accept a payload with selectedPresetId (UUID)', () => {
      const payload = {
        instructions: 'Test instructions',
        language: 'en' as const,
        selectedPresetId: '123e4567-e89b-12d3-a456-426614174000',
        sessionConfig: {
          maxOutputTokens: 1000,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept optional scene fields', () => {
      const payload = {
        instructions: 'Test instructions',
        language: 'en' as const,
        sceneInstructions: 'Use the late-night train setting.',
        selectedPresetId: null,
        selectedSceneId: 'bartender-after-closing',
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept null selectedSceneId', () => {
      const payload = {
        instructions: 'Test',
        selectedPresetId: null,
        selectedSceneId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };
      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept the optional memory opt-in flag', () => {
      const base = {
        instructions: 'Test',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      // Present (true/false) and absent are all valid; the paid-only gating is
      // enforced server-side in the route, not by the schema.
      for (const memory of [true, false, undefined]) {
        const result = playgroundStateSchema.safeParse({ ...base, memory });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.memory).toBe(memory);
        }
      }
    });

    it('should reject a non-boolean memory flag', () => {
      const payload = {
        instructions: 'Test',
        memory: 'yes',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };
      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should accept every known scene ID', () => {
      for (const scene of callScenes) {
        const payload = {
          instructions: 'Test',
          selectedPresetId: null,
          selectedSceneId: scene.id,
          sessionConfig: {
            maxOutputTokens: null,
            model: 'grok-voice-think-fast-1.0',
            temperature: 0.8,
            voice: 'Ara',
          },
        };
        const result = playgroundStateSchema.safeParse(payload);
        expect(result.success).toBe(true);
      }
    });

    it('should ignore client fields not needed for the call token', () => {
      const payload = {
        customCharacters: [],
        initialInstruction: 'Say hello',
        instructions: 'Test instructions',
        language: 'es' as const,
        selectedPresetId: '123e4567-e89b-12d3-a456-426614174000',
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 1.2,
          voice: 'Eve',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('customCharacters');
        expect(result.data).not.toHaveProperty('initialInstruction');
      }
    });

    it('should accept an inworld-realtime payload with audioReferenceId', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          model: 'inworld-realtime',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: null,
          audioReferenceId: '123e4567-e89b-12d3-a456-426614174000',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept all valid language codes', () => {
      const validLanguages = [
        'ar',
        'cs',
        'da',
        'de',
        'en',
        'es',
        'fi',
        'fr',
        'hi',
        'it',
        'ja',
        'ko',
        'nl',
        'no',
        'pl',
        'pt',
        'ru',
        'sv',
        'tr',
        'zh',
      ] as const;

      for (const lang of validLanguages) {
        const payload = {
          instructions: 'Test',
          language: lang,
          selectedPresetId: null,
          sessionConfig: {
            maxOutputTokens: null,
            model: 'test',
            temperature: 0.8,
            voice: 'Ara',
          },
        };

        const result = playgroundStateSchema.safeParse(payload);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('invalid payloads', () => {
    it('should reject payload with missing instructions', () => {
      const payload = {
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with missing sessionConfig', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject an unknown selectedSceneId', () => {
      const payload = {
        instructions: 'Test',
        selectedPresetId: null,
        selectedSceneId: 'totally-made-up-scene',
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };
      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with invalid UUID format', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: 'not-a-valid-uuid',
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with invalid language code', () => {
      const payload = {
        instructions: 'Test instructions',
        language: 'invalid',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with temperature out of range (too high)', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 2.5, // Max is 1.0
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with temperature out of range (negative)', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: -0.5, // Min is 0
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with missing voice in sessionConfig', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with non-number maxOutputTokens (excluding null)', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: '1000', // Should be number or null
          model: 'grok-voice-think-fast-1.0',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should accept temperature at minimum boundary (0.6)', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'test',
          temperature: 0.6,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept temperature at maximum boundary (1.2)', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'test',
          temperature: 1.2,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept empty string instructions', () => {
      const payload = {
        instructions: '',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'test',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept null selectedPresetId', () => {
      const payload = {
        instructions: 'Test',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: null,
          model: 'test',
          temperature: 0.8,
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('error format structure', () => {
    it('should return treeified error format with properties for invalid fields', () => {
      const payload = {
        // Missing instructions (required)
        selectedPresetId: 'not-a-uuid', // Invalid UUID format
        sessionConfig: {
          maxOutputTokens: null,
          model: 'test',
          temperature: 3.0, // Out of range
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);

      if (!result.success) {
        const treeified = getTreeifiedError(result.error);

        // Should have properties object with field-specific errors
        expect(treeified).toHaveProperty('properties');
        expect(treeified.properties).toHaveProperty('instructions');
        expect(treeified.properties).toHaveProperty('selectedPresetId');
        expect(treeified.properties).toHaveProperty('sessionConfig');

        // Should have error messages
        expect(treeified.properties!.instructions.errors).toBeDefined();
        expect(
          treeified.properties!.instructions.errors.length,
        ).toBeGreaterThan(0);
      }
    });

    it('should return nested error structure for sessionConfig validation', () => {
      const payload = {
        instructions: 'Test',
        selectedPresetId: null,
        sessionConfig: {
          maxOutputTokens: 'invalid', // Should be number or null
          model: 'test',
          temperature: -1, // Below minimum
          voice: 'Ara',
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);

      if (!result.success) {
        const treeified = getTreeifiedError(result.error);

        // Should have nested sessionConfig properties
        expect(treeified.properties!.sessionConfig).toHaveProperty(
          'properties',
        );
        expect(treeified.properties!.sessionConfig.properties).toHaveProperty(
          'temperature',
        );
        expect(treeified.properties!.sessionConfig.properties).toHaveProperty(
          'maxOutputTokens',
        );
      }
    });
  });
});
