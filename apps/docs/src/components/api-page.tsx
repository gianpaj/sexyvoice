'use client';

import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { codeUsages } from '@/lib/code-usage';

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
});
