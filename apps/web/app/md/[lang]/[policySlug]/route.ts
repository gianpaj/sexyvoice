import { allPolicyPages } from 'contentlayer/generated';

import type { Locale } from '@/lib/i18n/i18n-config';
import {
  buildMarkdownResponse,
  renderPolicyMarkdown,
} from '@/lib/markdown-for-agents';
import { routing } from '@/src/i18n/routing';

const POLICY_SLUGS = ['privacy-policy', 'terms'] as const;

type PolicySlug = (typeof POLICY_SLUGS)[number];

const isPolicySlug = (value: string): value is PolicySlug =>
  POLICY_SLUGS.includes(value as PolicySlug);

export const dynamic = 'force-static';

export function generateStaticParams() {
  return routing.locales.flatMap((lang) =>
    POLICY_SLUGS.map((policySlug) => ({ lang, policySlug })),
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: Locale; policySlug: string }> },
) {
  const { lang, policySlug } = await params;

  if (!(routing.locales.includes(lang) && isPolicySlug(policySlug))) {
    return new Response('Not Found', { status: 404 });
  }

  const policy =
    allPolicyPages.find((p) => p.slug === policySlug && p.locale === lang) ??
    allPolicyPages.find(
      (p) => p.slug === policySlug && p.locale === routing.defaultLocale,
    );

  if (!policy) {
    return new Response('Not Found', { status: 404 });
  }

  const body = renderPolicyMarkdown(policy);
  return buildMarkdownResponse(body);
}
