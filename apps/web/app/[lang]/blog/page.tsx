import { allPosts } from 'contentlayer/generated';
import type { Locale as DateFnsLocale } from 'date-fns';
import { format, parseISO } from 'date-fns';
import { da, de, es, fr, it } from 'date-fns/locale';
import Image from 'next/image';
import type { Metadata } from 'next/types';
import { getMessages, getTranslations } from 'next-intl/server';

import { MarketingPage } from '@/components/marketing-page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';
import { DEFAULT_OG_IMAGE, pageMetadata } from '@/lib/page-metadata';
import { SITE_NAME } from '@/lib/site';
import { breadcrumbList, graph, itemList } from '@/lib/structured-data';
import { calculateReadingTime, countWords } from '@/lib/text';
import { cn } from '@/lib/utils';
import { routing } from '@/src/i18n/routing';

export const dynamicParams = false;

export const generateStaticParams = () =>
  routing.locales.map((lang) => ({ lang }));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: 'landing' });
  const blogName = `${SITE_NAME} ${t('blogLabel')}`;

  return pageMetadata({
    description: t('blogDescription'),
    image: { ...DEFAULT_OG_IMAGE, alt: blogName },
    lang,
    path: '/blog',
    title: { absolute: `${t('latestPosts')} | ${blogName}` },
  });
}

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
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictLanding = messages.landing;
  const blogName = `${SITE_NAME} ${dictLanding.blogLabel}`;
  const pageTitle = `${dictLanding.latestPosts} | ${blogName}`;

  const posts = getLatestPostsByLang(lang);

  const jsonLd = graph(
    itemList({
      items: posts.map((post) => ({
        name: post.title,
        path: `/blog/${post.slug}`,
      })),
      lang,
      name: pageTitle,
      path: '/blog',
    }),
    breadcrumbList(lang, [
      { name: dictLanding.homeLabel, path: '/' },
      { name: dictLanding.blogLabel, path: '/blog' },
    ]),
  );

  return (
    <MarketingPage banner jsonLd={jsonLd} lang={lang}>
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
                {dictLanding.noPostsAvailable}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post, index) => {
                  const isFeatured = index === 0;
                  const wordCount = countWords(post.body.raw);
                  const readingTime = calculateReadingTime(wordCount);
                  const tag = post.keywords?.[0];

                  return (
                    <Card
                      className={cn(
                        'group overflow-hidden border-white/10 bg-black/20 py-0 backdrop-blur-sm transition-colors duration-200 hover:border-white/20 hover:bg-white/10',
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
                            'relative block overflow-hidden p-0',
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
                              {readingTime}&nbsp;{dictLanding.minutesRead}
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
                            {dictLanding.readMore} →
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
    </MarketingPage>
  );
}
