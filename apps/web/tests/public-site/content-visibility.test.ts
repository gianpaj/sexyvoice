import { describe, expect, it, vi } from 'vitest';

import { renderPage } from './render';
import { publicRoutes } from './routes';

vi.mock('contentlayer/generated', () => import('./content-fixtures'));
vi.mock('next-intl/server', () => import('./intl-server'));

function postLinks(document: Document) {
  const hrefs = [...document.querySelectorAll('a[href*="/blog/"]')].map(
    (link) => link.getAttribute('href'),
  );
  return [...new Set(hrefs)];
}

describe('post listings', () => {
  it('shows the newest published posts with a cover image on the landing page', async () => {
    expect(postLinks(await renderPage(publicRoutes.landing, 'en'))).toEqual([
      '/en/blog/realtime-ai-voice-call',
      '/en/blog/hello-from-sexyvoice',
    ]);
  });

  it('shows published posts with a cover image on the blog index', async () => {
    expect(postLinks(await renderPage(publicRoutes.blog, 'en'))).toEqual([
      '/en/blog/realtime-ai-voice-call',
      '/en/blog/hello-from-sexyvoice',
    ]);
    expect(postLinks(await renderPage(publicRoutes.blog, 'es'))).toEqual([
      '/es/blog/hello-from-sexyvoice',
    ]);
  });

  it('lists every published post in the blog markdown', async () => {
    const { GET } = await import('@/app/[lang]/blog.md/route');
    const response = await GET(new Request('https://sexyvoice.ai/en/blog.md'), {
      params: Promise.resolve({ lang: 'en' }),
    });
    const body = await response.text();
    expect(body.match(/^## \[.+\]\((.+)\)$/gm)).toEqual([
      '## [Real-time AI Voice Calls](https://sexyvoice.ai/en/blog/realtime-ai-voice-call)',
      '## [Voice AI Glossary](https://sexyvoice.ai/en/blog/voice-ai-glossary)',
      '## [Hello from SexyVoice.ai](https://sexyvoice.ai/en/blog/hello-from-sexyvoice)',
    ]);
  });
});

describe('drafts', () => {
  const draft = 'free-audio-joiner-tool';

  it('builds no page for a draft post', async () => {
    const { generateStaticParams } = await import(
      '@/app/[lang]/blog/[slug]/page'
    );
    expect(generateStaticParams({ params: { lang: 'en' } })).toEqual([
      { slug: 'realtime-ai-voice-call' },
      { slug: 'voice-ai-glossary' },
      { slug: 'hello-from-sexyvoice' },
    ]);
  });

  it('serves a draft post as not found', async () => {
    const { default: PostPage } = await import('@/app/[lang]/blog/[slug]/page');
    await expect(
      PostPage({ params: Promise.resolve({ lang: 'en', slug: draft }) }),
    ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('leaves a draft post out of the sitemap', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://sexyvoice.ai/en/blog/voice-ai-glossary');
    expect(urls.filter((url) => url.includes(draft))).toEqual([]);
  });
});

describe('policies', () => {
  it('fall back to the English original when untranslated', async () => {
    const { getPolicy } = await import('@/lib/content');
    expect(getPolicy('es', 'terms')?.locale).toBe('es');
    expect(getPolicy('de', 'terms')?.locale).toBe('en');
  });
});
