import { describe, expect, it } from 'vitest';

import {
  cloneStateReducer,
  initialCloneState,
} from '@/app/[lang]/(dashboard)/dashboard/clone/clone-state';

describe('cloneStateReducer', () => {
  it('preserves state identity for no-op patches', () => {
    const nextState = cloneStateReducer(initialCloneState, {
      patch: { ffmpegError: null },
      type: 'patch',
    });

    expect(nextState).toBe(initialCloneState);
  });

  it('returns a new state for changed patches', () => {
    const nextState = cloneStateReducer(initialCloneState, {
      patch: { text: 'hello' },
      type: 'patch',
    });

    expect(nextState).not.toBe(initialCloneState);
    expect(nextState.text).toBe('hello');
  });
});
