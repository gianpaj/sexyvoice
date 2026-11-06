import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MarketingPage } from '@/components/marketing-page';
import { Mdx } from '@/components/mdx-components';
import { getPolicy, isPolicySlug, POLICY_SLUGS } from '@/lib/content';
import type { Locale } from '@/lib/i18n/i18n-config';
import { pageMetadata } from '@/lib/page-metadata';
import { routing } from '@/src/i18n/routing';

interface Props {
  params: Promise<{ lang: Locale; policySlug: string }>;
}

async function policyFromParams({ params }: Props) {
  const { lang, policySlug } = await params;
  const policy = isPolicySlug(policySlug)
    ? getPolicy(lang, policySlug)
    : undefined;

  if (!policy) {
    notFound();
  }

  return { lang, policy, policySlug };
}

export const dynamicParams = false;

export const generateStaticParams = () =>
  routing.locales.flatMap((lang) =>
    POLICY_SLUGS.map((policySlug) => ({ lang, policySlug })),
  );

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, policy, policySlug } = await policyFromParams(props);
  return pageMetadata({
    description: policy.description ?? '',
    lang,
    path: `/${policySlug}`,
    title: policy.title,
  });
}

export default async function PolicyPage(props: Props) {
  const { lang, policy } = await policyFromParams(props);

  return (
    <MarketingPage
      className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800"
      lang={lang}
    >
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1>{policy.title}</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Updated {policy.updated}
        </p>
        <div className="prose prose-invert mt-6 prose-h1:mb-4 prose-h2:mb-4 prose-p:mb-4 prose-h1:font-bold prose-h2:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-p:text-lg">
          <Mdx code={policy.body.code} />
        </div>
      </div>
    </MarketingPage>
  );
}
