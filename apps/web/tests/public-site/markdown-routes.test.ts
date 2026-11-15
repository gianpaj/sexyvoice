import { describe, expect, it, vi } from 'vitest';

import { routing } from '@/src/i18n/routing';

vi.mock('contentlayer/generated', () => import('./content-fixtures'));
vi.mock('next-intl/server', () => import('./intl-server'));

type MarkdownParams = Record<string, string>;
interface MarkdownRoute {
  GET: (request: Request, context: never) => Promise<Response>;
}

// URL paths agents request, with the route that serves each one.
const routes: Record<string, () => Promise<MarkdownRoute>> = {
  'blog.md': () => import('@/app/[lang]/blog.md/route'),
  'landing.md': () => import('@/app/[lang]/landing.md/route'),
  'privacy-policy.md': () => import('@/app/[lang]/privacy-policy.md/route'),
  'terms.md': () => import('@/app/[lang]/terms.md/route'),
};

async function get(load: () => Promise<MarkdownRoute>, params: MarkdownParams) {
  const { GET } = await load();
  const response = await GET(new Request('https://sexyvoice.ai/'), {
    params: Promise.resolve(params),
  } as never);
  return {
    body: await response.text(),
    headers: Object.fromEntries(response.headers),
    status: response.status,
  };
}

describe.each(Object.entries(routes))('%s', (_path, load) => {
  it.each(routing.locales)('serves markdown in %s', async (lang) => {
    expect(await get(load, { lang })).toMatchSnapshot();
  });

  it('returns 404 for an unknown locale', async () => {
    expect((await get(load, { lang: 'pt' })).status).toBe(404);
  });

  it.each(routing.locales)('fills every placeholder in %s', async (lang) => {
    expect((await get(load, { lang })).body).not.toMatch(/\{\w+\}/);
  });
});

describe('blog post markdown', () => {
  const load = () => import('@/app/markdown-internal/blog/[lang]/[slug]/route');

  it.each([
    ['en', 'hello-from-sexyvoice'],
    ['es', 'hello-from-sexyvoice'],
    ['en', 'voice-ai-glossary'],
  ])('serves %s %s', async (lang, slug) => {
    expect(await get(load, { lang, slug })).toMatchSnapshot();
  });

  it.each([
    ['en', 'free-audio-joiner-tool'],
    ['de', 'hello-from-sexyvoice'],
    ['pt', 'hello-from-sexyvoice'],
  ])('returns 404 for %s %s', async (lang, slug) => {
    expect((await get(load, { lang, slug })).status).toBe(404);
  });
});
