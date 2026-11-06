import { listPosts } from '@/lib/content';
import { markdownResponse } from '@/lib/markdown-for-agents';
import { routing } from '@/src/i18n/routing';

// The proxy rewrites `/{lang}/blog/{slug}.md`, and post requests that ask for
// `Accept: text/markdown`, to this route.

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((lang) =>
    listPosts(lang).map((post) => ({ lang, slug: post.slug })),
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string; slug: string }> },
) {
  const { lang, slug } = await params;
  return markdownResponse(lang, `/blog/${slug}`);
}
