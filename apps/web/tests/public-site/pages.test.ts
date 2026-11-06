import { describe, expect, it, vi } from 'vitest';

import { jsonLdOf, type PublicRoute, renderPage } from './render';
import { blogPostRoute, publicRoutes } from './routes';

vi.mock('contentlayer/generated', () => import('./content-fixtures'));
vi.mock('next-intl/server', () => import('./intl-server'));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [] }),
}));
// The auth forms read the router, which only exists inside Next's app router.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const pages: Record<string, PublicRoute> = {
  audioConverter: publicRoutes.audioConverter,
  audioJoiner: publicRoutes.audioJoiner,
  blog: publicRoutes.blog,
  landing: publicRoutes.landing,
  login: publicRoutes.login,
  privacyPolicy: publicRoutes.privacyPolicy,
  resetPassword: publicRoutes.resetPassword,
  signup: publicRoutes.signup,
  terms: publicRoutes.terms,
  transcribe: publicRoutes.transcribe,
  voiceCall: publicRoutes.voiceCall,
  voiceCloning: publicRoutes.voiceCloning,
};

function chrome(document: Document) {
  const mains = [...document.querySelectorAll('main')];
  return {
    footerInMain: mains.some((main) => main.querySelector('footer')),
    footers: document.querySelectorAll('footer').length,
    headerInMain: mains.some((main) => main.querySelector('header')),
    headers: document.querySelectorAll('header').length,
    mainIds: mains.map((main) => main.id),
  };
}

function links(document: Document) {
  return [...document.querySelectorAll('a[href]')].map((link) =>
    link.getAttribute('href'),
  );
}

describe.each(Object.entries(pages))('%s page', (_name, route) => {
  it('renders one header and footer around the main content', async () => {
    expect(chrome(await renderPage(route, 'en'))).toMatchSnapshot();
  });

  it.each(['en', 'de'] as const)('links in %s', async (lang) => {
    expect(links(await renderPage(route, lang))).toMatchSnapshot();
  });

  it.each(['en', 'de'] as const)('structured data in %s', async (lang) => {
    expect(jsonLdOf(await renderPage(route, lang))).toMatchSnapshot();
  });
});

describe.each([
  ['en', 'hello-from-sexyvoice'],
  ['de', 'realtime-ai-voice-call'],
] as const)('%s blog post %s', (lang, slug) => {
  it('renders', async () => {
    const document = await renderPage(blogPostRoute(slug), lang);
    expect({
      chrome: chrome(document),
      jsonLd: jsonLdOf(document),
      links: links(document),
    }).toMatchSnapshot();
  });
});
