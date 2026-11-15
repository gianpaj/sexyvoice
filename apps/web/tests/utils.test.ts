import { describe, expect, test } from 'vitest';

import { cn, formatDate, nanoid } from '../lib/utils';

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

describe('nanoid', () => {
  test('generates a 7 character id', () => {
    const id = nanoid();
    expect(id.length).toBe(7);
    expect(/^[A-Za-z0-9]{7}$/.test(id)).toBe(true);
  });
});
