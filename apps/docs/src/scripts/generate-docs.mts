import { generateFiles } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';
import { OPENAPI_URL, openapi } from '@/lib/openapi';

// Accept a local schema for branch validation while preserving the published ID.
const input = process.argv[2]
  ? createOpenAPI({
      input: { [OPENAPI_URL]: process.argv[2] },
    })
  : openapi;

void generateFiles({
  input,
  output: './content/docs/api-reference/endpoints',
  // we recommend to enable it
  // make sure your endpoint description doesn't break MDX syntax.
  includeDescription: true,
});
