import { describe, expect, test } from 'vitest';

import {
  capitalizeFirstLetter,
  cn,
  estimateCredits,
  formatDate,
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
