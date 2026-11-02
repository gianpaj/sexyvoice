import { describe, expect, it } from 'vitest';

import {
  getVoiceIdByName,
  getVoiceIdByNameAdmin,
} from '@/lib/supabase/queries';

for (const [label, lookup] of [
  ['session', getVoiceIdByName],
  ['admin', getVoiceIdByNameAdmin],
] as const) {
  describe(`${label} voice-name fixture`, () => {
    it('keeps model scoping faithful to the production lookup', async () => {
      await expect(lookup('kore', true, ['gpro38'])).resolves.toBeNull();
      await expect(lookup('kore', true, ['gpro'])).resolves.toMatchObject({
        model: 'gpro',
        name: 'kore',
      });
      await expect(lookup('kore')).resolves.toMatchObject({ model: 'gpro' });
    });
  });
}
