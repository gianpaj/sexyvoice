import type { PolicyPage, Post } from 'contentlayer/generated';
import { createTranslator, hasLocale } from 'next-intl';
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
import { type FaqQuestion, getLandingContent } from '@/lib/landing-content';
import type { MarkdownPage } from '@/lib/public-routes';
import { localeUrl } from '@/lib/site';
import { splitHeroTitle } from '@/lib/text';
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
    return policy
      ? renderPolicyMarkdown(policy, lang, await getMessages({ locale: lang }))
      : null;
  }
  const post = getPost(lang, path.slice('/blog/'.length));
  return post
    ? renderBlogPostMarkdown(post, await getMessages({ locale: lang }))
    : null;
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

/** Dates in agent markdown stay machine-readable: `2025-04-28`. */
function isoDay(date: string): string {
  return date.slice(0, 10);
}

/** The labels around the content, in the page language. */
function markdownLabels(lang: Locale, messages: IntlMessages) {
  const t = createTranslator({ locale: lang, messages });
  return {
    by: t('blogPost.by'),
    canonicalUrl: (url: string) => t('markdown.canonicalUrl', { url }),
    features: t('markdown.features'),
    published: (date: string) => t('blogPost.published', { date }),
    updated: (date: string) => t('policy.updated', { date }),
  };
}

function faqAnswerMarkdown({ answer, linked }: FaqQuestion): string {
  return linked
    ? `${linked.before}[${linked.text}](${linked.url})${linked.after}`
    : answer;
}

/** The landing page as markdown, with the sections and order of the page. */
function renderLandingMarkdown(lang: Locale, messages: IntlMessages): string {
  const { cta, faq, features, hero, samples } = getLandingContent(
    messages.landing,
  );
  const [heroFirst, heroRest] = splitHeroTitle(hero.title);
  const labels = markdownLabels(lang, messages);
  const signupUrl = localeUrl(lang, '/signup');
  const lines = [
    `# ${messages.pages.defaultTitle}`,
    '',
    messages.pages.description,
    '',
    `## ${heroRest ? `${heroFirst.trim()} — ${heroRest.trim()}` : heroFirst}`,
    '',
    hero.subtitle,
    '',
    `[${hero.buttonCTA}](${signupUrl}) — ${hero.noCreditCard}`,
    '',
    `## ${labels.features}`,
    ...features.flatMap((feature) => [
      '',
      `### ${feature.title}`,
      '',
      feature.description,
    ]),
    '',
    `## ${samples.title}`,
    '',
    samples.subtitle,
    '',
    `## ${faq.title}`,
    '',
    faq.subtitle,
    ...faq.groups.flatMap((group) => [
      '',
      `### ${group.category}`,
      ...group.questions.flatMap((question) => [
        '',
        `#### ${question.question}`,
        '',
        faqAnswerMarkdown(question),
      ]),
    ]),
    '',
    `## ${cta.title}`,
    '',
    cta.subtitle,
    '',
    `[${cta.action}](${signupUrl})`,
    '',
    '---',
    '',
    labels.canonicalUrl(localeUrl(lang, '/')),
  ];
  return `${lines.join('\n').trim()}\n`;
}

export function renderBlogListMarkdown(
  lang: Locale,
  messages: IntlMessages,
  posts: readonly Post[],
): string {
  const { blogDescription, latestPosts, noPostsAvailable } = messages.landing;
  const lines = [`# ${latestPosts}`, '', blogDescription];

  if (posts.length === 0) {
    lines.push('', noPostsAvailable);
  } else {
    for (const post of posts) {
      lines.push('', `## [${post.title}](${localeUrl(lang, postPath(post))})`);
      lines.push('', `_${isoDay(post.date)}_`);
      if (post.description) {
        lines.push('', post.description);
      }
    }
  }

  lines.push(
    '',
    '---',
    '',
    markdownLabels(lang, messages).canonicalUrl(localeUrl(lang, '/blog')),
  );
  return `${lines.join('\n').trim()}\n`;
}

export function renderBlogPostMarkdown(
  post: Post,
  messages: IntlMessages,
): string {
  const lang = post.locale as Locale;
  const labels = markdownLabels(lang, messages);
  const lines: string[] = [];
  const url = localeUrl(lang, postPath(post));

  lines.push(`# ${post.title}`);
  if (post.description) {
    lines.push('', `> ${post.description}`);
  }
  const meta: string[] = [];
  if (post.date) meta.push(labels.published(isoDay(post.date)));
  if (post.author) meta.push(`${labels.by} ${post.author}`);
  meta.push(labels.canonicalUrl(url));
  lines.push('', meta.join(' · '));

  lines.push('', post.body.raw.trim());

  return `${lines.join('\n').trim()}\n`;
}

/** A policy as markdown, labeled in `lang` even when the text is English. */
export function renderPolicyMarkdown(
  policy: PolicyPage,
  lang: Locale,
  messages: IntlMessages,
): string {
  const labels = markdownLabels(lang, messages);
  const lines: string[] = [];
  const url = localeUrl(policy.locale as Locale, `/${policy.slug}`);

  lines.push(`# ${policy.title}`);
  if (policy.updated) {
    lines.push('', `_${labels.updated(policy.updated)}_`);
  }
  if (policy.description) {
    lines.push('', policy.description);
  }
  lines.push('', policy.body.raw.trim());
  lines.push('', '---', '', labels.canonicalUrl(url));
  return `${lines.join('\n').trim()}\n`;
}
