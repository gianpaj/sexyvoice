import { describe, expect, test } from 'vitest';

import { calculateReadingTime, countWords } from '@/lib/text';

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
