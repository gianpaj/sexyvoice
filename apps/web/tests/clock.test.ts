import { describe, expect, it } from 'vitest';

import { formatClock } from '@/lib/clock';

describe('formatClock', () => {
  it.each([
    [0, '0:00', '00:00'],
    [75.9, '1:15', '01:15'],
    [3725, '1:02:05', '01:02:05'],
    [-3, '0:00', '00:00'],
  ])('formats %s seconds', (seconds, short, padded) => {
    expect(formatClock(seconds)).toBe(short);
    expect(formatClock(seconds, { padMinutes: true })).toBe(padded);
  });
});
