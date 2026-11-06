import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { routing } from '@/src/i18n/routing';
import { renderHead } from './render';
import { blogPostRoute, publicRoutes } from './routes';

vi.mock('next/font/google', () => ({ Inter: () => ({ className: 'inter' }) }));
vi.mock('contentlayer/generated', () => import('./content-fixtures'));
vi.mock('next-intl/server', () => import('./intl-server'));

// Production metadata is what crawlers see.
beforeAll(() => {
  vi.stubEnv('NODE_ENV', 'production');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe.each(Object.entries(publicRoutes))('%s head', (_name, route) => {
  it.each(routing.locales)('%s', async (lang) => {
    expect(await renderHead(route, lang)).toMatchSnapshot();
  });
});

describe('blog post head', () => {
  it.each([
    ['en', 'hello-from-sexyvoice'],
    ['es', 'hello-from-sexyvoice'],
    ['de', 'realtime-ai-voice-call'],
    ['en', 'voice-ai-glossary'],
  ] as const)('%s %s', async (lang, slug) => {
    expect(await renderHead(blogPostRoute(slug), lang)).toMatchSnapshot();
  });
});
