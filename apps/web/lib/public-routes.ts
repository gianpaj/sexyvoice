/**
 * The localized pages that publish canonical and hreflang URLs, and how the
 * sitemap ranks them. Paths follow the locale prefix; every page exists in
 * every locale.
 */
export const PUBLIC_PAGES = [
  { path: '/', priority: 1 },
  { path: '/voice-call', priority: 0.5 },
  { path: '/voice-cloning', priority: 0.5 },
  { path: '/blog', priority: 0.5 },
  { path: '/tools/audio-converter', priority: 0.8 },
  { path: '/tools/audio-joiner', priority: 0.8 },
  { path: '/tools/transcribe', priority: 0.8 },
  { path: '/login', priority: 0.4 },
  { path: '/signup', priority: 0.4 },
  { path: '/privacy-policy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
] as const;

/** The sitemap priority of a blog post. */
export const POST_PRIORITY = 0.7;

/**
 * Pages that also serve agent markdown, at `/{lang}/landing.md` for the
 * landing page and `/{lang}{path}.md` for the others.
 */
export const MARKDOWN_PAGES = [
  '/',
  '/blog',
  '/privacy-policy',
  '/terms',
] as const;

export type MarkdownPage = (typeof MARKDOWN_PAGES)[number];
