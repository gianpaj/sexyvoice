import { describe, expect, it } from 'vitest';

import { formatTime } from '@/app/[lang]/tools/audio-joiner/format-time';

describe('audio joiner formatTime', () => {
  it.each([
    [0, '0:00.0'],
    [2.05, '0:02.0'],
    [3.9 - 1.3, '0:02.6'],
    [59.99, '0:59.9'],
    [60, '1:00.0'],
    [754.3, '12:34.3'],
  ])('formats %f seconds as %s', (valueSec, expected) => {
    expect(formatTime(valueSec)).toBe(expected);
  });
});
