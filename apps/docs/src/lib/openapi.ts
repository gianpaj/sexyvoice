import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  // Refresh with `pnpm --filter @sexyvoice/web openapi:docs`.
  input: ['./content/docs/api-reference/openapi.json'],
});
