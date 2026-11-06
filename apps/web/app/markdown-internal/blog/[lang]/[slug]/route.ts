import { getPost, listPosts } from '@/lib/content';
import type { Locale } from '@/lib/i18n/i18n-config';
import {
  buildMarkdownResponse,
  renderBlogPostMarkdown,
} from '@/lib/markdown-for-agents';
import { routing } from '@/src/i18n/routing';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((lang) =>
    listPosts(lang).map((post) => ({ lang, slug: post.slug })),
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: Locale; slug: string }> },
) {
  const { lang, slug } = await params;

  if (!routing.locales.includes(lang)) {
    return new Response('Not Found', { status: 404 });
  }

  const post = getPost(lang, slug);

  if (!post) {
    return new Response('Not Found', { status: 404 });
  }

  const body = renderBlogPostMarkdown(post);
  return buildMarkdownResponse(body);
}
