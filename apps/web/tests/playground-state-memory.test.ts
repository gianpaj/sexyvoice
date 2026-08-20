import { describe, expect, it } from 'vitest';

import { defaultPlaygroundState } from '@/data/playground-state';
import { callTokenPlaygroundStateSchema } from '@/lib/call-token-schema';
import { createPlaygroundStateHelpers } from '@/lib/playground-state-helpers';

// Memory is on for every call. These tests pin the client side of that
// default: the initial state, and the payload the call page posts to
// /api/call-token.
describe('playground state memory default', () => {
  const helpers = createPlaygroundStateHelpers();

  it('starts with memory on', () => {
    expect(defaultPlaygroundState.memory).toBe(true);
  });

  it('sends memory on in the call-token payload', () => {
    const payload = helpers.getStateWithFullInstructions({
      ...defaultPlaygroundState,
    });

    expect(payload.memory).toBe(true);

    const result = callTokenPlaygroundStateSchema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data?.memory).toBe(true);
  });

  it('keeps an explicit opt-out in the call-token payload', () => {
    const payload = helpers.getStateWithFullInstructions({
      ...defaultPlaygroundState,
      memory: false,
    });

    expect(payload.memory).toBe(false);

    const result = callTokenPlaygroundStateSchema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data?.memory).toBe(false);
  });
});
