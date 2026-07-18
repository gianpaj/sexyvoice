import { describe, expect, it } from 'vitest';

import {
  CloneServiceError,
  calculateReferenceAudioEnhancementCredits,
  getCloneProviderConstraints,
  getReferenceAudioEnhancementDollarCost,
  isVoxtralCloneLocale,
  resolveCloneProvider,
  sanitizeFilename,
  validateAudioDuration,
  validateLocale,
} from '@/lib/clone/clone-service';

describe('clone-service', () => {
  describe('resolveCloneProvider', () => {
    it('uses Mistral Voxtral for supported Voxtral locales', () => {
      expect(resolveCloneProvider('en')).toBe('mistral');
      expect(resolveCloneProvider('es')).toBe('mistral');
      expect(isVoxtralCloneLocale('fr')).toBe(true);
    });

    it('falls back to Replicate for non-Voxtral locales', () => {
      expect(resolveCloneProvider('ja')).toBe('replicate');
      expect(isVoxtralCloneLocale('ja')).toBe(false);
    });
  });

  describe('getCloneProviderConstraints', () => {
    it('returns the provider-specific minimum reference duration', () => {
      expect(getCloneProviderConstraints('mistral').minDurationSeconds).toBe(3);
      expect(getCloneProviderConstraints('replicate').minDurationSeconds).toBe(
        10,
      );
    });
  });

  describe('validateLocale', () => {
    it('accepts supported locales', () => {
      expect(() => validateLocale('en')).not.toThrow();
      expect(() => validateLocale('ja')).not.toThrow();
    });

    it('throws CloneServiceError for unsupported locales', () => {
      expect(() => validateLocale('xyz')).toThrow(CloneServiceError);
      try {
        validateLocale('xyz');
      } catch (error) {
        expect((error as CloneServiceError).code).toBe('unsupported_locale');
      }
    });
  });

  describe('validateAudioDuration', () => {
    it('accepts durations at or above the provider minimum', () => {
      expect(() => validateAudioDuration(5, 'mistral')).not.toThrow();
      expect(() => validateAudioDuration(10, 'replicate')).not.toThrow();
    });

    it('throws when the duration is unknown', () => {
      try {
        validateAudioDuration(null, 'mistral');
      } catch (error) {
        expect((error as CloneServiceError).code).toBe(
          'audio_duration_unknown',
        );
      }
    });

    it('throws when the reference audio is too short', () => {
      try {
        validateAudioDuration(2, 'mistral');
      } catch (error) {
        expect((error as CloneServiceError).code).toBe(
          'audio_duration_too_short',
        );
      }
    });
  });

  describe('enhancement billing helpers', () => {
    it('charges 10 credits per second, rounded up', () => {
      expect(calculateReferenceAudioEnhancementCredits(12)).toBe(120);
      expect(calculateReferenceAudioEnhancementCredits(12.1)).toBe(121);
    });

    it('computes the dollar cost at $0.001 per second', () => {
      expect(getReferenceAudioEnhancementDollarCost(12)).toBeCloseTo(0.012);
      expect(getReferenceAudioEnhancementDollarCost(null)).toBe(0);
    });
  });

  describe('sanitizeFilename', () => {
    it('strips diacritics and special characters', () => {
      expect(sanitizeFilename('tëst-äudio!@#.wav')).toBe('test-audio___.wav');
    });
  });
});
