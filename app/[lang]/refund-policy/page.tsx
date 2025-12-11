import { allPolicies } from 'contentlayer/generated';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { MDXContent } from './mdx-content';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const lang = (await params).lang;

  if (!i18n.locales.includes(lang as Locale)) {
    return {
      title: 'Refund Policy',
    };
  }

  const policy = allPolicies.find(
    (p) => p.slug === 'refund-policy' && p.locale === lang,
  );

  if (!policy) {
    return {
      title: 'Refund Policy',
    };
  }

  const { openGraph } = await parent;

  return {
    title: policy.title,
    description: policy.description,
    openGraph: {
      title: policy.title,
      description: policy.description,
      type: 'website',
      ...(openGraph?.url ? { url: openGraph.url } : {}),
      ...(openGraph?.images ? { images: openGraph.images } : {}),
      ...(openGraph?.siteName ? { siteName: openGraph.siteName } : {}),
    },
  };
}

export default async function RefundPolicyPage({ params }: Props) {
  const { lang } = await params;

  if (!i18n.locales.includes(lang)) {
    notFound();
  }

  const policy = allPolicies.find(
    (p) => p.slug === 'refund-policy' && p.locale === lang,
  );

  if (!policy) {
    notFound();
  }

  return (
    <>
      <HeaderStatic lang={lang} />
      <main className="min-h-screen bg-gray-900" id="main-content">
        <div className="container mx-auto px-4 py-16">
          <article className="mx-auto max-w-4xl">
            <div className="mb-12">
              <h1 className="mb-4 font-bold text-4xl text-white md:text-5xl">
                {policy.title}
              </h1>
              <p className="text-gray-300 text-lg">{policy.description}</p>
            </div>

            <div className="prose prose-invert max-w-none">
              <MDXContent code={policy.body.code} />
            </div>
          </article>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
