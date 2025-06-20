import assert from 'node:assert';
import { describe, test } from 'node:test';

import { capitalizeFirstLetter, cn, formatDate, nanoid } from './utils';
import { estimateCredits } from './utils';

// This model costs approximately $0.015 to run on Replicate, or 66 runs per $1
//
// if 5 USD = 10000 credits, and 0.025 USD per run
//
// e.g. 26sec run for 22 audio ()

describe('estimateCredits', async () => {
  test('should correctly estimate credits for Spanish short text', () => {
    const text = 'Hello world';
    const credits = estimateCredits(text, 'javi');
    assert.equal(credits, 96); // 2 words with 8x multiplier
  });

  test('should correctly estimate credits for longer text', () => {
    const text =
      'This is a longer sentence that should take more time to speak';
    const credits = estimateCredits(text, 'tara');
    assert.equal(credits, 288); // 12 words with 4x multiplier
  });

  test('should handle empty text', () => {
    const text = '';
    const credits = estimateCredits(text, 'tara');
    assert.equal(credits, 0);
  });

  test('should handle text with multiple spaces', () => {
    const text = 'Hello     world    test';
    const credits = estimateCredits(text, 'tara');
    assert.equal(credits, 72); // 3 words with 4x multiplier
  });

  test('should handle text with leading/trailing spaces', () => {
    const text = '   Hello world   ';
    const credits = estimateCredits(text, 'tara');
    assert.equal(credits, 48); // 2 words with 4x multiplier
  });

  test('should handle text with newlines', () => {
    const text = 'Hello\nworld\ntest';
    const credits = estimateCredits(text, 'tara');
    assert.equal(credits, 72); // 3 words with 4x multiplier
  });

  test('should handle emotion tags', () => {
    const text =
      'Oh my, <pants> <moaning> oh <gasp> <moaning> oh oh <breathing> <moaning> oh oh oh <sigh> <moaning> wow. that was hot';
    const credits = estimateCredits(text, 'tara');
    assert.equal(credits, 480); // 20 words with 4x multiplier
  });
});

// Tests for cn function
describe('cn', () => {
  test('merges class names', () => {
    const result = cn('foo', 'bar');
    assert.equal(result, 'foo bar');
  });

  test('deduplicates tailwind classes', () => {
    const result = cn('px-2', 'px-4');
    assert.equal(result, 'px-4');
  });

  test('handles conditional classes', () => {
    const result = cn('foo', { bar: true, baz: false });
    assert.equal(result, 'foo bar');
  });
});

// Tests for formatDate function
describe('formatDate', () => {
  test('formats date without time', () => {
    const result = formatDate('2024-01-01T00:00:00Z');
    assert.equal(result, 'January 1, 2024');
  });

  test('formats date with time', () => {
    const result = formatDate('2024-01-01T15:30:00Z', { withTime: true });
    assert.ok(result.includes('January 1, 2024'));
    assert.ok(/:30/.test(result));
  });
});

// Tests for capitalizeFirstLetter function
describe('capitalizeFirstLetter', () => {
  test('capitalizes the first character', () => {
    assert.equal(capitalizeFirstLetter('hello'), 'Hello');
  });
});

// Tests for nanoid
describe('nanoid', () => {
  test('generates a 7 character id', () => {
    const id = nanoid();
    assert.equal(id.length, 7);
    assert.ok(/^[A-Za-z0-9]{7}$/.test(id));
  });
});
