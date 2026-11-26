import { describe, expect, it } from 'vitest';

import { createExternalApiOpenApiDocument } from '@/lib/api/openapi';

// The docs app builds its API reference from this committed copy, so a
// spec change shows up as a docs change. Refresh it with:
// pnpm --filter @sexyvoice/web openapi:docs
describe('docs OpenAPI spec', () => {
  it('matches the external API document', async () => {
    const spec = `${JSON.stringify(createExternalApiOpenApiDocument(), null, 2)}\n`;

    await expect(spec).toMatchFileSnapshot(
      '../../docs/content/docs/api-reference/openapi.json',
    );
  });
});
