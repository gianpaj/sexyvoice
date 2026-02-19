import { describe, expect, it } from 'vitest';
import { z } from 'zod';

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
  // Zod schema for session config (duplicated from route.ts for testing)
  const sessionConfigSchema = z.object({
    model: z.string(),
    voice: z.string(),
    temperature: z.number().min(0).max(2),
    maxOutputTokens: z.number().nullable(),
    grokImageEnabled: z.boolean(),
  });

  // Zod schema for playground state (duplicated from route.ts for testing)
  const playgroundStateSchema = z.object({
    instructions: z.string(),
    language: z
      .enum([
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
      ] as const)
      .optional(),
    selectedPresetId: z.string().uuid().nullable(),
    sessionConfig: sessionConfigSchema,
    customCharacters: z.array(z.any()).optional(),
    characterOverrides: z
      .record(z.string(), z.record(z.string(), z.string()))
      .optional(),
    initialInstruction: z.string().optional(),
    defaultPresets: z.array(z.any()).optional(),
  });

  describe('valid payloads', () => {
    it('should accept a minimal valid payload', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: null,
          grokImageEnabled: false,
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept a payload with selectedPresetId (UUID)', () => {
      const payload = {
        instructions: 'Test instructions',
        language: 'en' as const,
        selectedPresetId: '123e4567-e89b-12d3-a456-426614174000',
        sessionConfig: {
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: 1000,
          grokImageEnabled: true,
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept a payload with all optional fields', () => {
      const payload = {
        instructions: 'Test instructions',
        language: 'es' as const,
        selectedPresetId: '123e4567-e89b-12d3-a456-426614174000',
        sessionConfig: {
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Eve',
          temperature: 1.2,
          maxOutputTokens: null,
          grokImageEnabled: false,
        },
        customCharacters: [],
        characterOverrides: {},
        initialInstruction: 'Say hello',
        defaultPresets: [],
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
            model: 'test',
            voice: 'Ara',
            temperature: 0.8,
            maxOutputTokens: null,
            grokImageEnabled: false,
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
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: null,
          grokImageEnabled: false,
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

    it('should reject payload with invalid UUID format', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: 'not-a-valid-uuid',
        sessionConfig: {
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: null,
          grokImageEnabled: false,
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
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: null,
          grokImageEnabled: false,
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
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Ara',
          temperature: 2.5, // Max is 2.0
          maxOutputTokens: null,
          grokImageEnabled: false,
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
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Ara',
          temperature: -0.5, // Min is 0
          maxOutputTokens: null,
          grokImageEnabled: false,
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
          model: 'grok-4-1-fast-non-reasoning',
          temperature: 0.8,
          maxOutputTokens: null,
          grokImageEnabled: false,
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with wrong type for grokImageEnabled', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: null,
          grokImageEnabled: 'true', // Should be boolean
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
          model: 'grok-4-1-fast-non-reasoning',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: '1000', // Should be number or null
          grokImageEnabled: false,
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should accept temperature at minimum boundary (0)', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          model: 'test',
          voice: 'Ara',
          temperature: 0,
          maxOutputTokens: null,
          grokImageEnabled: false,
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept temperature at maximum boundary (2)', () => {
      const payload = {
        instructions: 'Test instructions',
        selectedPresetId: null,
        sessionConfig: {
          model: 'test',
          voice: 'Ara',
          temperature: 2,
          maxOutputTokens: null,
          grokImageEnabled: false,
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
          model: 'test',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: null,
          grokImageEnabled: false,
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
          model: 'test',
          voice: 'Ara',
          temperature: 0.8,
          maxOutputTokens: null,
          grokImageEnabled: false,
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
          model: 'test',
          voice: 'Ara',
          temperature: 3.0, // Out of range
          maxOutputTokens: null,
          grokImageEnabled: false,
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
        expect(treeified.properties.instructions.errors).toBeDefined();
        expect(treeified.properties.instructions.errors.length).toBeGreaterThan(
          0,
        );
      }
    });

    it('should return nested error structure for sessionConfig validation', () => {
      const payload = {
        instructions: 'Test',
        selectedPresetId: null,
        sessionConfig: {
          model: 'test',
          voice: 'Ara',
          temperature: -1, // Below minimum
          maxOutputTokens: 'invalid', // Should be number or null
          grokImageEnabled: false,
        },
      };

      const result = playgroundStateSchema.safeParse(payload);
      expect(result.success).toBe(false);

      if (!result.success) {
        const treeified = getTreeifiedError(result.error);

        // Should have nested sessionConfig properties
        expect(treeified.properties.sessionConfig).toHaveProperty('properties');
        expect(treeified.properties.sessionConfig.properties).toHaveProperty(
          'temperature',
        );
        expect(treeified.properties.sessionConfig.properties).toHaveProperty(
          'maxOutputTokens',
        );
      }
    });
  });
});
