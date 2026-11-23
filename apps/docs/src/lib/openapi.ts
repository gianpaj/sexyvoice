import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  // Generated from apps/web by tests/api-v1-openapi-docs-spec.test.ts.
  input: ['./content/docs/api-reference/openapi.json'],
});
