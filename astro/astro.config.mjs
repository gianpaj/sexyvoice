// @ts-check

import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';

import { fileURLToPath, URL } from 'node:url';

// https://astro.build/config
export default defineConfig({
  experimental: {
    fonts: [
      {
        provider: fontProviders.google(),
        name: 'Inter',
        cssVariable: '--font-inter',
      },
    ],
  },
  vite: {
    resolve: {
      alias: {
        '#lib': fileURLToPath(new URL('../lib', import.meta.url)),
      },
    },
    plugins: [tailwindcss()],
  },
});
