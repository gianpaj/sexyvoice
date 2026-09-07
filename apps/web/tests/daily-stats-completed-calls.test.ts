import { expect, test } from 'vitest';

import { isCompletedUserCall } from '../app/api/daily-stats/utils';

test.each([
  ['completed', 'user_disconnect', 11, true],
  ['completed', 'user_disconnect', 10, false],
  ['completed', 'user_disconnect', 9, false],
  ['completed', 'user_disconnect', 0, false],
  ['active', 'user_disconnect', 60, false],
  ['failed', 'user_disconnect', 60, false],
  ['completed', 'credits_exhausted', 60, true],
  ['completed', null, 60, true],
] as const)(
  'completed call: %s / %s / %ss → %s',
  (status, end_reason, duration_seconds, expected) => {
    const call = { duration_seconds, end_reason, status };
    expect(isCompletedUserCall(call)).toBe(expected);
  },
);
