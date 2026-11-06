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
