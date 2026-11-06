import type { PolicyPage, Post } from 'contentlayer/generated';
import { hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';

import {
  BLOG_INDEX_LIMIT,
  getPolicy,
  getPost,
  isPolicySlug,
  listPosts,
  postPath,
} from '@/lib/content';
import type { Locale } from '@/lib/i18n/i18n-config';
import type { MarkdownPage } from '@/lib/public-routes';
import { localeUrl, SITE_URL } from '@/lib/site';
import { routing } from '@/src/i18n/routing';

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

// Heuristic: ~4 characters per token (matches OpenAI's public guidance).
export function estimateMarkdownTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function buildMarkdownResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': MARKDOWN_CONTENT_TYPE,
      Vary: 'Accept',
      'X-Robots-Tag': 'noindex, nofollow',
      'x-markdown-tokens': String(estimateMarkdownTokens(body)),
    },
  });
}

/** A markdown page, or a blog post at `/blog/{slug}`. */
type MarkdownPath = MarkdownPage | `/blog/${string}`;

async function renderPageMarkdown(
  lang: Locale,
  path: MarkdownPath,
): Promise<string | null> {
  if (path === '/') {
    return renderLandingMarkdown(lang, await getMessages({ locale: lang }));
  }
  if (path === '/blog') {
    return renderBlogListMarkdown(
      lang,
      await getMessages({ locale: lang }),
      listPosts(lang, BLOG_INDEX_LIMIT),
    );
  }
  const policySlug = path.slice(1);
  if (isPolicySlug(policySlug)) {
    const policy = getPolicy(lang, policySlug);
    return policy ? renderPolicyMarkdown(policy) : null;
  }
  const post = getPost(lang, path.slice('/blog/'.length));
  return post ? renderBlogPostMarkdown(post) : null;
}

/** The markdown of a page for agents, or 404 for an unknown locale or post. */
export async function markdownResponse(
  lang: string,
  path: MarkdownPath,
): Promise<Response> {
  const body = hasLocale(routing.locales, lang)
    ? await renderPageMarkdown(lang, path)
    : null;
  return body === null
    ? new Response('Not Found', { status: 404 })
    : buildMarkdownResponse(body);
}

export const markdownStaticParams = () =>
  routing.locales.map((lang) => ({ lang }));

/**
 * The GET handler of a page's `.md` route. The proxy also rewrites requests
 * that ask for `Accept: text/markdown` to these routes.
 */
export function markdownRoute(path: MarkdownPage) {
  return async (
    _request: Request,
    { params }: { params: Promise<{ lang: string }> },
  ) => markdownResponse((await params).lang, path);
}

type LandingMessages = IntlMessages['landing'];

/** Dates in agent markdown stay machine-readable: `2025-04-28`. */
function isoDay(date: string): string {
  return date.slice(0, 10);
}

function renderHeroSection(lang: Locale, landing: LandingMessages): string[] {
  const lines: string[] = [];
  const heroTitle = landing.hero?.title?.replace(/\s*,\s*/g, ' — ') ?? '';
  if (heroTitle) {
    lines.push('', `## ${heroTitle}`);
  }
  if (landing.hero?.subtitle) {
    lines.push('', landing.hero.subtitle);
  }
  if (landing.hero?.buttonCTA) {
    const cta =
      `[${landing.hero.buttonCTA}](${SITE_URL}/${lang}/signup) — ${landing.hero.noCreditCard ?? ''}`.trim();
    lines.push('', cta);
  }
  return lines;
}

function renderFeaturesSection(landing: LandingMessages): string[] {
  const features = landing.features;
  if (!features) return [];
  const lines: string[] = ['', '## Features'];
  for (const key of Object.keys(features) as Array<keyof typeof features>) {
    const feature = features[key];
    if (feature?.title) {
      lines.push('', `### ${feature.title}`);
    }
    if (feature?.description) {
      lines.push('', feature.description);
    }
  }
  return lines;
}

function renderFaqSection(landing: LandingMessages): string[] {
  if (!landing.faq?.title) return [];
  const lines: string[] = ['', `## ${landing.faq.title}`];
  if (landing.faq.subtitle) {
    lines.push('', landing.faq.subtitle);
  }
  for (const group of landing.faq.groups ?? []) {
    if (group.category) {
      lines.push('', `### ${group.category}`);
    }
    for (const q of group.questions ?? []) {
      if (q.question) {
        lines.push('', `#### ${q.question}`);
      }
      if (q.answer) {
        lines.push('', q.answer);
      }
    }
  }
  return lines;
}

function renderCtaSection(lang: Locale, landing: LandingMessages): string[] {
  if (!landing.cta?.title) return [];
  const lines: string[] = ['', `## ${landing.cta.title}`];
  if (landing.cta.subtitle) {
    lines.push('', landing.cta.subtitle);
  }
  if (landing.cta.action) {
    lines.push('', `[${landing.cta.action}](${SITE_URL}/${lang}/signup)`);
  }
  return lines;
}

export function renderLandingMarkdown(
  lang: Locale,
  messages: IntlMessages,
): string {
  const landing = messages.landing as LandingMessages;
  const siteTitle = messages.pages?.defaultTitle ?? 'SexyVoice.ai';
  const description = messages.pages?.description ?? '';
  const lines: string[] = [`# ${siteTitle}`];

  if (description) {
    lines.push('', description);
  }

  lines.push(...renderHeroSection(lang, landing));
  lines.push(...renderFeaturesSection(landing));

  if (landing.popular?.trySamplesTitle) {
    lines.push('', `## ${landing.popular.trySamplesTitle}`);
    if (landing.popular.trySamplesSubtitle) {
      lines.push('', landing.popular.trySamplesSubtitle);
    }
  }

  lines.push(...renderFaqSection(landing));
  lines.push(...renderCtaSection(lang, landing));
  lines.push('', '---', '', `Canonical URL: ${SITE_URL}/${lang}`);
  return `${lines.join('\n').trim()}\n`;
}

export function renderBlogListMarkdown(
  lang: Locale,
  messages: IntlMessages,
  posts: readonly Post[],
): string {
  const landing = messages.landing as LandingMessages;
  const title = landing.latestPosts ?? 'Latest Posts';
  const description = landing.blogDescription ?? '';
  const lines: string[] = [];

  lines.push(`# ${title}`);
  if (description) {
    lines.push('', description);
  }

  if (posts.length === 0) {
    lines.push('', landing.noPostsAvailable ?? 'No posts available yet.');
  } else {
    for (const post of posts) {
      lines.push('', `## [${post.title}](${localeUrl(lang, postPath(post))})`);
      lines.push('', `_${isoDay(post.date)}_`);
      if (post.description) {
        lines.push('', post.description);
      }
    }
  }

  lines.push('', '---', '', `Canonical URL: ${localeUrl(lang, '/blog')}`);
  return `${lines.join('\n').trim()}\n`;
}

export function renderBlogPostMarkdown(post: Post): string {
  const lines: string[] = [];
  const url = localeUrl(post.locale as Locale, postPath(post));

  lines.push(`# ${post.title}`);
  if (post.description) {
    lines.push('', `> ${post.description}`);
  }
  const meta: string[] = [];
  if (post.date) meta.push(`Published: ${isoDay(post.date)}`);
  if (post.author) meta.push(`Author: ${post.author}`);
  meta.push(`Canonical: ${url}`);
  lines.push('', meta.join(' · '));

  lines.push('', post.body.raw.trim());

  return `${lines.join('\n').trim()}\n`;
}

export function renderPolicyMarkdown(policy: PolicyPage): string {
  const lines: string[] = [];
  const url = localeUrl(policy.locale as Locale, `/${policy.slug}`);

  lines.push(`# ${policy.title}`);
  if (policy.updated) {
    lines.push('', `_Updated: ${policy.updated}_`);
  }
  if (policy.description) {
    lines.push('', policy.description);
  }
  lines.push('', policy.body.raw.trim());
  lines.push('', '---', '', `Canonical URL: ${url}`);
  return `${lines.join('\n').trim()}\n`;
}
