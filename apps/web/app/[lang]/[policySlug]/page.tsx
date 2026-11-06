import { allPolicyPages } from 'contentlayer/generated';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MarketingPage } from '@/components/marketing-page';
import { Mdx } from '@/components/mdx-components';
import type { Locale } from '@/lib/i18n/i18n-config';
import { pageMetadata } from '@/lib/page-metadata';
import { routing } from '@/src/i18n/routing';

const POLICY_CONFIG = {
  'privacy-policy': {
    fallbackTitle: 'Privacy Policy',
  },
  terms: {
    fallbackTitle: 'Terms and Conditions',
  },
} as const;

type PolicySlug = keyof typeof POLICY_CONFIG;

interface Props {
  params: Promise<{ lang: Locale; policySlug: string }>;
}

const isPolicySlug = (value: string): value is PolicySlug =>
  value in POLICY_CONFIG;

const getPolicyByLocale = (lang: Locale, policySlug: PolicySlug) => {
  const localized = allPolicyPages.find(
    (policy) => policy.slug === policySlug && policy.locale === lang,
  );

  if (localized) return localized;

  return allPolicyPages.find(
    (policy) =>
      policy.slug === policySlug && policy.locale === routing.defaultLocale,
  );
};

export const dynamicParams = false;

export const generateStaticParams = () =>
  routing.locales.flatMap((lang) =>
    (Object.keys(POLICY_CONFIG) as PolicySlug[]).map((policySlug) => ({
      lang,
      policySlug,
    })),
  );

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, policySlug } = await params;

  if (!isPolicySlug(policySlug)) {
    return {
      title: 'Policy',
    } satisfies Metadata;
  }

  const policy = getPolicyByLocale(lang, policySlug);

  if (!policy) {
    return {
      title: POLICY_CONFIG[policySlug].fallbackTitle,
    } satisfies Metadata;
  }

  return pageMetadata({
    description: policy.description ?? '',
    lang,
    path: `/${policySlug}`,
    title: policy.title,
  });
}

export default async function PolicyPage({ params }: Props) {
  const { lang, policySlug } = await params;
  const policy = isPolicySlug(policySlug)
    ? getPolicyByLocale(lang, policySlug)
    : undefined;

  if (!policy) {
    notFound();
  }

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
