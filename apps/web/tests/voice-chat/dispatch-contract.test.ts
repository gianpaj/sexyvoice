import { pythonCallDispatchSchema } from '@sexyvoice/voice-chat/dispatch';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import fixture from '../../../../packages/voice-chat/contracts/dispatch-v1.fixtures.json';
import schema from '../../../../packages/voice-chat/contracts/dispatch-v1.schema.json';

describe('LiveKit Python dispatch v1', () => {
  it('exports the checked-in JSON Schema from the Zod definition', () => {
    expect(z.toJSONSchema(pythonCallDispatchSchema)).toEqual(schema);
  });

  it.each(fixture.cases)('$name', ({ overrides, omit, valid }) => {
    const payload: Record<string, unknown> = { ...fixture.base, ...overrides };
    if (omit) delete payload[omit];
    expect(pythonCallDispatchSchema.safeParse(payload).success).toBe(valid);
  });
});
