import { openapi } from '@/lib/openapi';
import { createAPIPage } from 'fumadocs-openapi/ui';

import { codeUsages } from '@/lib/code-usage';
// import { mediaAdapters } from '@/lib/media';

import client from './api-page.client';


export const APIPage = createAPIPage(openapi, {
  client,
  codeUsages,
  // mediaAdapters
});
