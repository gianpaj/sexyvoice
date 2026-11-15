import { createOpenAPI } from 'fumadocs-openapi/server';

import { siteUrl } from '@/lib/shared';

/** The published API schema, which also identifies the generated pages. */
export const OPENAPI_URL = `${siteUrl}/api/v1/openapi`;

export const openapi = createOpenAPI({
  input: [OPENAPI_URL],
});
