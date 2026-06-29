import { describe, expect, test } from 'vitest';

import {
  calculateCreditsFromTokens,
  calculateGeminiTtsDollarAmount,
  calculateGrokTtsDollarAmount,
  calculateReadingTime,
  capitalizeFirstLetter,
  cn,
  countWords,
  estimateCredits,
  estimateGrokCredits,
  formatDate,
  getTtsProvider,
  nanoid,
} from '../lib/utils';

// This model costs approximately $0.015 to run on Replicate, or 66 runs per $1
//
// if 5 USD = 10000 credits, and 0.025 USD per run
//
// e.g. 26sec run for 22 audio ()

describe('estimateCredits', () => {
  test('should correctly estimate credits for Spanish short text', () => {
    const text = 'Hello world';
    const credits = estimateCredits(text, 'javi');
    expect(credits).toBe(96); // 2 words with 8x multiplier
  });

  test('should correctly estimate credits for longer text', () => {
    const text =
      'This is a longer sentence that should take more time to speak';
    const credits = estimateCredits(text, 'tara');
    expect(credits).toBe(288); // 12 words with 4x multiplier
  });

  test('should handle empty text', () => {
    const text = '';
    const credits = estimateCredits(text, 'tara');
    expect(credits).toBe(0);
  });

  test('should handle text with multiple spaces', () => {
    const text = 'Hello     world    test';
    const credits = estimateCredits(text, 'tara');
    expect(credits).toBe(72); // 3 words with 4x multiplier
  });

  test('should handle text with leading/trailing spaces', () => {
    const text = '   Hello world   ';
    const credits = estimateCredits(text, 'tara');
    expect(credits).toBe(48); // 2 words with 4x multiplier
  });

  test('should handle text with newlines', () => {
    const text = 'Hello\nworld\ntest';
    const credits = estimateCredits(text, 'tara');
    expect(credits).toBe(72); // 3 words with 4x multiplier
  });

  test('should handle emotion tags', () => {
    const text =
      'Oh my, <pants> <moaning> oh <gasp> <moaning> oh oh <breathing> <moaning> oh oh oh <sigh> <moaning> wow. that was hot';
    const credits = estimateCredits(text, 'tara');
    expect(credits).toBe(480); // 20 words with 4x multiplier
  });

  test('should estimate Grok credits by character buckets', () => {
    const text = 'a'.repeat(101);
    const credits = estimateCredits(text, 'eve', 'xai');
    expect(credits).toBe(200); // 2 buckets at 100 credits each
  });

  test('should count Grok tags toward billing estimate', () => {
    const text = '<fast>Hello</fast> [laugh]';
    const credits = estimateCredits(text, 'eve', 'xai');
    expect(credits).toBe(100); // 27 characters = 1 bucket
  });

  test('should charge free users roughly double for Gemini 3.1 voices', () => {
    const text =
      'This is a longer sentence that should take more time to speak';
    const paid = estimateCredits(text, 'achernar', 'gpro31', true);
    const free = estimateCredits(text, 'achernar', 'gpro31', false);
    // Free users run the full Gemini 3.1 model (twice the cost of the 2.5
    // Flash model that gpro voices are downgraded to), so they pay double.
    // ceil() can shift the result by at most 1 credit either side of 2x.
    expect(free).toBeGreaterThan(paid);
    expect(free).toBeGreaterThanOrEqual(paid * 2 - 1);
    expect(free).toBeLessThanOrEqual(paid * 2);
  });

  test('should not change Gemini 2.5 (gpro) pricing by tier', () => {
    const text =
      'This is a longer sentence that should take more time to speak';
    const paid = estimateCredits(text, 'kore', 'gpro', true);
    const free = estimateCredits(text, 'kore', 'gpro', false);
    expect(free).toBe(paid);
  });
});

describe('calculateCreditsFromTokens', () => {
  test('should convert tokens to credits at the base rate', () => {
    expect(calculateCreditsFromTokens(100)).toBe(Math.ceil(100 * 1.1));
  });

  test('should clamp negative token counts to zero', () => {
    expect(calculateCreditsFromTokens(-50)).toBe(0);
  });

  test('should charge free users double for Gemini 3.1 voices', () => {
    expect(
      calculateCreditsFromTokens(100, { model: 'gpro31', userHasPaid: false }),
    ).toBe(Math.ceil(100 * 1.1 * 2));
  });

  test('should not double credits for paid Gemini 3.1 users', () => {
    expect(
      calculateCreditsFromTokens(100, { model: 'gpro31', userHasPaid: true }),
    ).toBe(calculateCreditsFromTokens(100));
  });

  test('should not double credits for Gemini 2.5 (gpro) voices', () => {
    expect(
      calculateCreditsFromTokens(100, { model: 'gpro', userHasPaid: false }),
    ).toBe(calculateCreditsFromTokens(100));
  });
});

describe('estimateGrokCredits', () => {
  test('should return 0 for empty text', () => {
    expect(estimateGrokCredits('')).toBe(0);
  });

  test('should charge one bucket for short text', () => {
    expect(estimateGrokCredits('Hello world')).toBe(100);
  });

  test('should charge multiple buckets for longer text', () => {
    expect(estimateGrokCredits('a'.repeat(250))).toBe(300);
  });
});

describe('calculateGrokTtsDollarAmount', () => {
  test('returns zero for empty text', () => {
    expect(calculateGrokTtsDollarAmount('')).toBe(0);
  });

  test('calculates Grok TTS cost per character', () => {
    expect(calculateGrokTtsDollarAmount('Hello [laugh]')).toBe(0.000_055);
  });
});

describe('calculateGeminiTtsDollarAmount', () => {
  test('calculates Gemini 2.5 Pro TTS cost from input and output tokens', () => {
    expect(
      calculateGeminiTtsDollarAmount({
        model: 'gemini-2.5-pro-preview-tts',
        promptTokenCount: 11,
        candidatesTokenCount: 12,
      }),
    ).toBe(0.000_251);
  });

  test('calculates Gemini 3.1 Flash TTS cost at Pro TTS rates', () => {
    expect(
      calculateGeminiTtsDollarAmount({
        model: 'gemini-3.1-flash-tts-preview',
        promptTokenCount: 6,
        candidatesTokenCount: 36,
      }),
    ).toBe(0.000_726);
  });

  test('calculates Gemini 2.5 Flash TTS cost at flash rates', () => {
    expect(
      calculateGeminiTtsDollarAmount({
        model: 'gemini-2.5-flash-preview-tts',
        promptTokenCount: 11,
        candidatesTokenCount: 12,
      }),
    ).toBe(0.000_126);
  });
});

describe('getTtsProvider', () => {
  test('returns gemini for gpro', () => {
    expect(getTtsProvider('gpro')).toBe('gemini');
  });

  test('returns grok for xai', () => {
    expect(getTtsProvider('xai')).toBe('grok');
  });

  test('returns replicate for unknown models', () => {
    expect(getTtsProvider('some-owner/some-model')).toBe('replicate');
  });

  test('returns replicate when model is undefined', () => {
    expect(getTtsProvider()).toBe('replicate');
  });
});

describe('countWords', () => {
  test('returns zero for blank text', () => {
    expect(countWords('   \n\t  ')).toBe(0);
  });

  test('counts words across repeated whitespace', () => {
    expect(countWords('Hello     world\nfrom\tSexyVoice')).toBe(4);
  });
});

describe('calculateReadingTime', () => {
  test('rounds up to the next minute', () => {
    expect(calculateReadingTime(201)).toBe(2);
  });

  test('returns zero when no words are present', () => {
    expect(calculateReadingTime(0)).toBe(0);
  });

  test('throws when words per minute is zero or negative', () => {
    expect(() => calculateReadingTime(100, 0)).toThrow(
      'wordsPerMinute must be greater than 0',
    );
    expect(() => calculateReadingTime(100, -1)).toThrow(
      'wordsPerMinute must be greater than 0',
    );
  });
});

// Tests for cn function
describe('cn', () => {
  test('merges class names', () => {
    const result = cn('foo', 'bar');
    expect(result).toBe('foo bar');
  });

  test('deduplicates tailwind classes', () => {
    const result = cn('px-2', 'px-4');
    expect(result).toBe('px-4');
  });

  test('handles conditional classes', () => {
    const result = cn('foo', { bar: true, baz: false });
    expect(result).toBe('foo bar');
  });
});

// Tests for formatDate function
describe('formatDate', () => {
  test('formats date without time', () => {
    const result = formatDate('2024-01-01T00:00:00Z');
    expect(result).toBe('January 1, 2024');
  });

  test('formats date with time', () => {
    const result = formatDate('2024-01-01T15:30:00Z', { withTime: true });
    // UTC timezone: 15:30 = 3:30 PM
    expect(result).toBe('January 1, 2024 at 03:30 PM');
  });
});

// Tests for capitalizeFirstLetter function
describe('capitalizeFirstLetter', () => {
  test('capitalizes the first character', () => {
    expect(capitalizeFirstLetter('hello')).toBe('Hello');
  });
});

// Tests for nanoid
describe('nanoid', () => {
  test('generates a 7 character id', () => {
    const id = nanoid();
    expect(id.length).toBe(7);
    expect(/^[A-Za-z0-9]{7}$/.test(id)).toBe(true);
  });
});
