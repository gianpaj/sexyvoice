'use client';

import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { codeUsages } from '@/lib/code-usage';
// import { mediaAdapters } from '@/lib/media';

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  // mediaAdapters
});

export const APIPage = OpenAPIPage;
