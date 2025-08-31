import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  capitalizeFirstLetter,
  cn,
  formatDate,
  nanoid,
} from './utils';

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
    assert.ok(/04:30\s?PM/.test(result));
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
