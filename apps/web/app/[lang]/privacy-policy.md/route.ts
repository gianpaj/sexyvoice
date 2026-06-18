import { allPolicyPages } from 'contentlayer/generated';

import type { Locale } from '@/lib/i18n/i18n-config';
import {
  buildMarkdownResponse,
  renderPolicyMarkdown,
} from '@/lib/markdown-for-agents';
import { routing } from '@/src/i18n/routing';

const POLICY_SLUG = 'privacy-policy';

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

  const policy =
    allPolicyPages.find((p) => p.slug === POLICY_SLUG && p.locale === lang) ??
    allPolicyPages.find(
      (p) => p.slug === POLICY_SLUG && p.locale === routing.defaultLocale,
    );

  if (!policy) {
    return new Response('Not Found', { status: 404 });
  }

  const body = renderPolicyMarkdown(policy);
  return buildMarkdownResponse(body);
}
