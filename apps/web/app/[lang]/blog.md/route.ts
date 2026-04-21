import { allPosts } from 'contentlayer/generated';
import { getMessages } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/i18n-config';
import {
  buildMarkdownResponse,
  renderBlogListMarkdown,
} from '@/lib/markdown-for-agents';
import { routing } from '@/src/i18n/routing';

export const dynamic = 'force-static';

const LATEST_POSTS_LIMIT = 20;

export function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: Locale }> },
) {
  const { lang } = await params;

  if (!routing.locales.includes(lang)) {
    return new Response('Not Found', { status: 404 });
  }

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const posts = allPosts
    .filter((post) => post.locale === lang && !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, LATEST_POSTS_LIMIT);

  const body = renderBlogListMarkdown(lang, messages, posts);
  return buildMarkdownResponse(body);
}
