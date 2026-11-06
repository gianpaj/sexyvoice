import { getMessages } from 'next-intl/server';

import { BLOG_INDEX_LIMIT, listPosts } from '@/lib/content';
import type { Locale } from '@/lib/i18n/i18n-config';
import {
  buildMarkdownResponse,
  renderBlogListMarkdown,
} from '@/lib/markdown-for-agents';
import { routing } from '@/src/i18n/routing';

export const dynamic = 'force-static';

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
  const body = renderBlogListMarkdown(
    lang,
    messages,
    listPosts(lang, BLOG_INDEX_LIMIT),
  );
  return buildMarkdownResponse(body);
}
