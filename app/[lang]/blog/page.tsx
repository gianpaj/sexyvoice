import { allPosts } from 'contentlayer/generated';
import type { Locale as DateFnsLocale } from 'date-fns';
import { format, parseISO } from 'date-fns';
import { da, de, es, fr, it } from 'date-fns/locale';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next/types';
import { getMessages } from 'next-intl/server';
import type { ComponentProps } from 'react';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { PromoBanner } from '@/components/promo-banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';

export const dynamicParams = false;

export const generateStaticParams = () =>
  i18n.locales.map((lang) => ({ lang }));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictLanding = messages.landing;

  const title = `${dictLanding.latestPosts} | SexyVoice.ai Blog`;
  const description = dictLanding.blogDescription;
  const pageUrl = `https://sexyvoice.ai/${lang}/blog`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'SexyVoice.ai',
      images: [
        {
          url: '/sexyvoice.ai-og-image.jpg',
          width: 1200,
          height: 630,
          alt: 'SexyVoice.ai Blog',
        },
      ],
      locale: lang,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/sexyvoice.ai-og-image.jpg'],
    },
    alternates: {
      canonical: `https://sexyvoice.ai/${i18n.defaultLocale}/blog`,
      languages: {
        ...Object.fromEntries(
          i18n.locales.map((locale) => [locale, `/${locale}/blog`]),
        ),
        'x-default': `/${i18n.defaultLocale}/blog`,
      },
    },
  };
}

type PromoCountdownLabels = NonNullable<
  ComponentProps<typeof PromoBanner>['countdown']
>['labels'];

type BlogPostWithImage = (typeof allPosts)[number] & {
  image: string;
};

const LATEST_POSTS_LIMIT = 20;

const dateFnsLocales: Partial<Record<Locale, DateFnsLocale>> = {
  da,
  de,
  es,
  fr,
  it,
};
const DEFAULT_PROMO_KEY = 'blackFridayBanner';

const getLatestPostsByLang = (lang: Locale): BlogPostWithImage[] =>
  allPosts
    .filter(
      (post): post is BlogPostWithImage =>
        post.locale === lang && typeof post.image === 'string' && !post.draft,
    )
    .sort(
      (postA, postB) =>
        new Date(postB.date).getTime() - new Date(postA.date).getTime(),
    )
    .slice(0, LATEST_POSTS_LIMIT);

export default async function BlogIndexPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;

  if (!i18n.locales.includes(lang as Locale)) {
    redirect(`/${i18n.defaultLocale}`);
  }

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictLanding = messages.landing;

  const promoDictKey =
    process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS || DEFAULT_PROMO_KEY;
  const promoDict = Object.hasOwn(messages.promos, promoDictKey)
    ? messages.promos[promoDictKey as keyof typeof messages.promos]
    : undefined;

  const promoCountdown =
    process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE &&
    promoDict &&
    'countdown' in promoDict
      ? ({
          enabled: true,
          endDate: process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE,
          labels: promoDict.countdown as PromoCountdownLabels,
        } satisfies ComponentProps<typeof PromoBanner>['countdown'])
      : undefined;

  const posts = getLatestPostsByLang(lang);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `https://sexyvoice.ai/${lang}`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Blog',
            item: `https://sexyvoice.ai/${lang}/blog`,
          },
        ],
      },
      {
        '@type': 'ItemList',
        name: 'SexyVoice.ai Blog',
        url: `https://sexyvoice.ai/${lang}/blog`,
        numberOfItems: posts.length,
        itemListElement: posts.map((post, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `https://sexyvoice.ai${post.url}`,
          name: post.title,
        })),
      },
    ],
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      {promoDict && (
        <PromoBanner
          ariaLabelDismiss={promoDict.ariaLabelDismiss}
          countdown={promoCountdown}
          ctaLink={`/${lang}/signup`}
          ctaText={promoDict.ctaLoggedOut}
          isEnabled={process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true'}
          text={promoDict.text}
        />
      )}
      <HeaderStatic />
      <main id="main-content">
        <div className="min-h-screen bg-linear-to-br from-background to-gray-800">
          <div className="container mx-auto px-4 py-12 md:py-16">
            <div className="mx-auto max-w-6xl">
              <h1 className="mb-8 text-center font-bold text-3xl text-white md:mb-12 md:text-4xl">
                {dictLanding.latestPosts}
              </h1>

              {posts.length === 0 ? (
                <p className="text-center text-gray-400">
                  No posts available yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {posts.map((post, index) => (
                    <Card
                      className="overflow-hidden border-white/10 bg-black/20 backdrop-blur-sm"
                      key={post._id}
                    >
                      <Link className="flex h-full flex-col" href={post.url}>
                        <CardHeader className="p-0">
                          <Image
                            alt={post.title}
                            className="h-48 w-full object-cover"
                            height={320}
                            loading={index < 3 ? 'eager' : 'lazy'}
                            priority={index < 3}
                            src={post.image}
                            width={640}
                          />
                        </CardHeader>
                        <CardContent className="flex grow flex-col gap-3 p-5">
                          <p className="text-gray-400 text-sm">
                            {format(parseISO(post.date), 'MMMM dd, yyyy', {
                              locale: dateFnsLocales[lang],
                            })}
                          </p>
                          <CardTitle className="line-clamp-2 text-gray-100 text-xl leading-7">
                            {post.title}
                          </CardTitle>
                          {post.description && (
                            <p className="line-clamp-3 text-gray-300 text-sm leading-6">
                              {post.description}
                            </p>
                          )}
                        </CardContent>
                      </Link>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
