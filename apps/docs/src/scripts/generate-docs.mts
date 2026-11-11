import { generateFiles } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';
import { openapi } from '@/lib/openapi';

// Accept a local schema for branch validation while preserving the published ID.
const input = process.argv[2]
  ? createOpenAPI({
      input: { 'https://sexyvoice.ai/api/v1/openapi': process.argv[2] },
    })
  : openapi;

void generateFiles({
  input,
  output: './content/docs/api-reference/endpoints',
  // we recommend to enable it
  // make sure your endpoint description doesn't break MDX syntax.
  includeDescription: true,
});
