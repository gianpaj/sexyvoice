import { allPosts } from 'contentlayer/generated';

import type { Locale } from '@/lib/i18n/i18n-config';
import {
  buildMarkdownResponse,
  renderBlogPostMarkdown,
} from '@/lib/markdown-for-agents';
import { routing } from '@/src/i18n/routing';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return allPosts
    .filter((post) => !post.draft)
    .map((post) => ({ lang: post.locale, slug: post.slugAsParams }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: Locale; slug: string }> },
) {
  const { lang, slug } = await params;

  if (!routing.locales.includes(lang)) {
    return new Response('Not Found', { status: 404 });
  }

  const post = allPosts.find(
    (p) => p.slugAsParams === slug && p.locale === lang && !p.draft,
  );

  if (!post) {
    return new Response('Not Found', { status: 404 });
  }

  const body = renderBlogPostMarkdown(post);
  return buildMarkdownResponse(body);
}
