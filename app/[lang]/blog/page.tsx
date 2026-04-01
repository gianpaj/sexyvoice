import { allPosts } from 'contentlayer/generated';
import type { Locale as DateFnsLocale } from 'date-fns';
import { format, parseISO } from 'date-fns';
import { da, de, es, fr, it } from 'date-fns/locale';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import Script from 'next/script';
import type { Metadata } from 'next/types';
import { getMessages } from 'next-intl/server';
import type { ComponentProps } from 'react';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { PromoBanner } from '@/components/promo-banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

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

  const titleStr = `${dictLanding.latestPosts} | SexyVoice.ai Blog`;
  const description = dictLanding.blogDescription;
  const pageUrl = `https://sexyvoice.ai/${lang}/blog`;

  return {
    title: { absolute: titleStr },
    description,
    openGraph: {
      title: titleStr,
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
      title: titleStr,
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

  const itemListSchema = {
    '@context': 'https://schema.org',
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
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
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
  };

  return (
    <>
      {/* Structured Data for search engines and LLM understanding */}
      <Script id="blog-list-schema" type="application/ld+json">
        {JSON.stringify(itemListSchema)}
      </Script>
      <Script id="breadcrumb-schema" type="application/ld+json">
        {JSON.stringify(breadcrumbSchema)}
      </Script>
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
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black"
        href="#main-content"
      >
        Skip to content
      </a>
      <HeaderStatic />
      <main id="main-content">
        <div className="relative min-h-screen bg-linear-to-br from-background to-gray-800">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-0 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-purple-700/20 blur-[120px]" />
          </div>
          <div className="container relative mx-auto px-4 py-12 md:py-16">
            <div className="mx-auto max-w-6xl">
              <h1 className="mb-4 text-balance text-center font-bold text-3xl text-white md:text-4xl">
                {dictLanding.latestPosts}
              </h1>
              <p className="mx-auto mb-10 max-w-xl text-balance text-center text-base text-gray-300 md:mb-12">
                {dictLanding.blogDescription}
              </p>

              {posts.length === 0 ? (
                <p className="text-center text-gray-400">
                  No posts available yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {posts.map((post, index) => {
                    const isFeatured = index === 0;
                    const readingTime = Math.max(
                      1,
                      Math.round(post.body.raw.split(/\s+/).length / 200),
                    );
                    const tag = post.keywords?.[0];

                    return (
                      <Card
                        className={cn(
                          'group overflow-hidden border-white/10 bg-black/20 backdrop-blur-sm transition-colors duration-200 hover:border-white/20 hover:bg-white/10',
                          isFeatured && 'sm:col-span-2 lg:col-span-3',
                        )}
                        key={post._id}
                      >
                        <Link
                          className={cn(
                            'flex h-full flex-col',
                            isFeatured && 'sm:flex-row',
                          )}
                          href={post.url}
                        >
                          <CardHeader
                            className={cn(
                              'p-0',
                              isFeatured && 'sm:w-2/5 sm:shrink-0',
                            )}
                          >
                            <Image
                              alt={post.title}
                              className={cn(
                                'w-full object-cover transition-transform duration-300 group-hover:scale-105',
                                isFeatured ? 'h-56 sm:h-full' : 'h-48',
                              )}
                              height={320}
                              loading={index < 3 ? 'eager' : 'lazy'}
                              priority={index < 3}
                              sizes={
                                isFeatured
                                  ? '(max-width: 640px) 100vw, (max-width: 1024px) 40vw, 460px'
                                  : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
                              }
                              src={post.image}
                              width={640}
                            />
                          </CardHeader>
                          <CardContent className="flex grow flex-col gap-3 p-5">
                            {tag && (
                              <span className="w-fit rounded-full bg-purple-700/30 px-2.5 py-0.5 font-medium text-purple-300 text-xs capitalize">
                                {tag}
                              </span>
                            )}
                            <p className="flex items-center gap-2 text-gray-400 text-sm">
                              <svg
                                aria-hidden="true"
                                className="size-3.5 shrink-0"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.5}
                                viewBox="0 0 24 24"
                              >
                                <path
                                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span className="whitespace-nowrap">
                                {format(parseISO(post.date), 'MMMM dd, yyyy', {
                                  locale: dateFnsLocales[lang],
                                })}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="whitespace-nowrap">
                                {readingTime}&nbsp;min read
                              </span>
                            </p>
                            <CardTitle
                              className={cn(
                                'line-clamp-2 text-gray-100 leading-7',
                                isFeatured ? 'text-2xl' : 'text-xl',
                              )}
                            >
                              {post.title}
                            </CardTitle>
                            {post.description && (
                              <p
                                className={cn(
                                  'text-gray-300 text-sm leading-6',
                                  isFeatured ? 'line-clamp-4' : 'line-clamp-3',
                                )}
                              >
                                {post.description}
                              </p>
                            )}
                            <p className="mt-auto pt-2 text-sm text-white/60 transition-colors duration-200 group-hover:text-white/90">
                              Read more →
                            </p>
                          </CardContent>
                        </Link>
                      </Card>
                    );
                  })}
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
