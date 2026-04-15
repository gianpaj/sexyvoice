'use client';
import { defineClientConfig } from 'fumadocs-openapi/ui/client';
import { codeUsages } from '@/lib/code-usage';
// import { mediaAdapters } from '@/lib/media';


export default defineClientConfig({
  codeUsages,
  // mediaAdapters
});
