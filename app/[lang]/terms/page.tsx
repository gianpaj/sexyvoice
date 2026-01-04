import { allPolicyPages } from 'contentlayer/generated';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { Mdx } from '@/components/mdx-components';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';

const TERMS_SLUG = 'terms';

const getPolicyByLocale = (lang: Locale) => {
  const localized = allPolicyPages.find(
    (policy) => policy.slug === TERMS_SLUG && policy.locale === lang,
  );

  if (localized) return localized;

  return allPolicyPages.find(
    (policy) =>
      policy.slug === TERMS_SLUG && policy.locale === i18n.defaultLocale,
  );
};

export const dynamicParams = false;

export const generateStaticParams = () =>
  i18n.locales.map((lang) => ({
    lang,
  }));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const policy = getPolicyByLocale(lang);

  if (!policy) {
    return {
      title: 'Terms and Conditions',
    } satisfies Metadata;
  }

  return {
    title: policy.title,
    description: policy.description,
    alternates: {
      canonical: `https://sexyvoice.ai/${lang}/${TERMS_SLUG}`,
      languages: Object.fromEntries(
        i18n.locales.map((locale) => [locale, `/${locale}/${TERMS_SLUG}`]),
      ),
    },
  } satisfies Metadata;
}

export default async function TermsPolicyPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const dictHeader = await getDictionary(lang, 'header');

  if (!i18n.locales.includes(lang)) {
    redirect(`/${i18n.defaultLocale}/${TERMS_SLUG}`);
  }

  const policy = getPolicyByLocale(lang);

  if (!policy) {
    redirect(`/${i18n.defaultLocale}/${TERMS_SLUG}`);
  }

  return (
    <main className="min-h-screen dark:bg-gradient-to-br dark:from-gray-900 dark:to-gray-800">
      <HeaderStatic dict={dictHeader} lang={lang} />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1>{policy.title}</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Updated {policy.updated}
        </p>
        <div className="prose prose-invert mt-6 prose-h1:mb-4 prose-h2:mb-4 prose-p:mb-4 prose-h1:font-bold prose-h2:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-p:text-lg">
          <Mdx code={policy.body.code} />
        </div>
      </div>
      <Footer lang={lang} />
    </main>
  );
}
