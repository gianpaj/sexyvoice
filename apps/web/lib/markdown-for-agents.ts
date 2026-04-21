import type { PolicyPage, Post } from 'contentlayer/generated';

import type { Locale } from '@/lib/i18n/i18n-config';

const SITE_URL = 'https://sexyvoice.ai';

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

// Heuristic: ~4 characters per token (matches OpenAI's public guidance).
export function estimateMarkdownTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function buildMarkdownResponse(
  body: string,
  init: ResponseInit = {},
): Response {
  const tokens = estimateMarkdownTokens(body);
  const headers = new Headers(init.headers);
  headers.set('Content-Type', MARKDOWN_CONTENT_TYPE);
  headers.set('x-markdown-tokens', String(tokens));
  const existingVary = headers.get('Vary');
  headers.set('Vary', existingVary ? `${existingVary}, Accept` : 'Accept');
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  return new Response(body, { ...init, headers });
}

type LandingMessages = IntlMessages['landing'];

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
      const url = `${SITE_URL}/${lang}/blog/${post.slug}`;
      lines.push('', `## [${post.title}](${url})`);
      lines.push('', `_${post.date}_`);
      if (post.description) {
        lines.push('', post.description);
      }
    }
  }

  lines.push('', '---', '', `Canonical URL: ${SITE_URL}/${lang}/blog`);
  return `${lines.join('\n').trim()}\n`;
}

export function renderBlogPostMarkdown(post: Post): string {
  const lines: string[] = [];
  const url = `${SITE_URL}/${post.locale}/blog/${post.slug}`;

  lines.push(`# ${post.title}`);
  if (post.description) {
    lines.push('', `> ${post.description}`);
  }
  const meta: string[] = [];
  if (post.date) meta.push(`Published: ${post.date.slice(0, 10)}`);
  if (post.author) meta.push(`Author: ${post.author}`);
  meta.push(`Canonical: ${url}`);
  lines.push('', meta.join(' · '));

  lines.push('', post.body.raw.trim());

  return `${lines.join('\n').trim()}\n`;
}

export function renderPolicyMarkdown(policy: PolicyPage): string {
  const lines: string[] = [];
  const url = `${SITE_URL}/${policy.locale}/${policy.slug}`;

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
