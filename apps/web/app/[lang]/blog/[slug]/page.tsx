import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next/types';
import { getMessages } from 'next-intl/server';

import { MarketingPage } from '@/components/marketing-page';
import { Mdx } from '@/components/mdx-components';
import {
  formatPostDate,
  getPost,
  listPosts,
  postLocales,
  postPath,
} from '@/lib/content';
import type { Locale } from '@/lib/i18n/i18n-config';
import { DEFAULT_OG_IMAGE, pageMetadata } from '@/lib/page-metadata';
import { SITE_LOGO, SITE_NAME, SITE_URL } from '@/lib/site';
import {
  breadcrumbList,
  graph,
  organization,
  techArticle,
} from '@/lib/structured-data';
import { calculateReadingTime, countWords } from '@/lib/text';

export const dynamicParams = false;

export const generateStaticParams = ({
  params: { lang },
}: {
  params: { lang: Locale };
}) => listPosts(lang).map((post) => ({ slug: post.slug }));

interface Props {
  params: Promise<{ lang: Locale; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const post = getPost(lang, slug);

  if (!post) {
    return {};
  }

  return {
    ...pageMetadata({
      article: {
        publishedTime: post.date,
        section: 'Technology',
        tags: ['Voice AI', 'Voice Cloning', 'Speech Synthesis'],
      },
      description: post.description,
      image: post.image
        ? { alt: post.title, height: 630, url: post.image, width: 1200 }
        : { ...DEFAULT_OG_IMAGE, alt: post.title },
      keywords: post.keywords || [
        'AI voice generation',
        'voice cloning',
        'text-to-speech',
        'voice synthesis',
        'AI voice call',
      ],
      lang,
      // Alternates name only translated posts, so crawlers never follow a
      // locale the post does not exist in.
      locales: postLocales(slug),
      path: postPath(post),
      title: post.title,
    }),
    authors: [{ name: SITE_NAME }],
  };
}

const PostLayout = async (props: Props) => {
  const { lang, slug } = await props.params;
  const post = getPost(lang, slug);

  if (!post) {
    notFound();
  }

  const messages = (await getMessages({ locale: lang })) as IntlMessages;

  const wordCount = countWords(post.body.raw);
  const readingTime = calculateReadingTime(wordCount);
  const path = postPath(post);
  const jsonLd = graph(
    organization(),
    techArticle({
      date: post.date,
      description: post.description,
      lang,
      path,
      readingMinutes: readingTime,
      title: post.title,
      wordCount,
    }),
    breadcrumbList(lang, [
      { name: messages.landing.homeLabel, path: '/' },
      { name: post.title, path },
    ]),
  );

  return (
    <MarketingPage banner jsonLd={jsonLd} lang={lang}>
      {/* Semantic content structure for AI extraction */}
      <div
        className="sr-only"
        itemScope
        itemType="https://schema.org/TechArticle"
      >
        <p itemProp="name">{post.title}</p>
        <div itemProp="abstract">{post.description}</div>
        <p>
          Target audience:
          <span
            itemProp="audience"
            itemScope
            itemType="https://schema.org/EducationalAudience"
          >
            <span itemProp="educationalRole">storytellers</span>,
            <span itemProp="educationalRole">content creators</span>
          </span>
        </p>
        <p
          itemProp="educationalLevel"
          itemScope
          itemType="https://schema.org/DefinedTerm"
        >
          <span itemProp="name">Beginner to Intermediate</span>
        </p>
        <p>
          Resource type:
          <span itemProp="learningResourceType">tutorial</span>
        </p>
      </div>

      <div itemScope itemType="https://schema.org/WebPage">
        <article
          className="prose prose-invert max-w-2xl px-4 py-8 md:mx-auto md:px-0"
          itemProp="mainEntity"
          itemScope
          itemType="https://schema.org/BlogPosting"
        >
          <header className="my-8 text-center">
            {/* <nav aria-label="Breadcrumb" className="mb-4">
              <ol className="inline-flex items-center space-x-1 sm:space-x-0 list-none">
                <li className="inline-flex items-center">
                  <a
                    href={`/${lang}`}
                    className="text-sm text-gray-500 hover:text-blue-600"
                  >
                    Home
                  </a>
                </li>
                <li>
                  <div className="flex items-center">
                    <span className="mx-2 text-gray-400">/</span>
                    <a
                      href={`/${lang}/blog`}
                      className="text-sm text-gray-500 hover:text-blue-600"
                    >
                      Blog
                    </a>
                  </div>
                </li>
                <li>
                  <div className="flex items-center">
                    <span className="mx-2 text-gray-400">/</span>
                    <span className="text-sm text-gray-500 truncate max-w-[200px]">
                      {post.title}
                    </span>
                  </div>
                </li>
              </ol>
            </nav> */}

            <div className="mb-4 flex items-center justify-center space-x-4 text-gray-600 text-xs">
              <time
                content={post.date}
                dateTime={post.date}
                itemProp="datePublished"
              >
                Published: {formatPostDate(post.date, lang)}
              </time>
              <span>•</span>
              <span content={`PT${readingTime}M`} itemProp="timeRequired">
                {readingTime} min read
              </span>
              <span>•</span>
              <span itemProp="wordCount">{wordCount} words</span>
            </div>

            <h1 className="mt-12 mb-4" itemProp="headline">
              {post.title}
            </h1>

            <div
              className="mt-8 mb-6 text-gray-400 text-lg"
              itemProp="description"
            >
              {post.description}
            </div>

            {/* Enhanced author and publisher information */}
            <div className="flex items-center justify-center space-x-2 text-gray-500 text-sm">
              <span>By</span>
              <div
                itemProp="author"
                itemScope
                itemType="https://schema.org/Organization"
              >
                {post.author === 'Gianfranco' ? (
                  <a
                    href="https://x.com/gianpaj"
                    itemProp="name"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {post.author}
                  </a>
                ) : (
                  <span itemProp="name">{post.author || SITE_NAME}</span>
                )}
                <meta content={SITE_URL} itemProp="url" />
                <meta content={SITE_LOGO.url} itemProp="logo" />
              </div>
            </div>

            {/* Publisher information for LLM extraction */}
            <div
              className="sr-only"
              itemProp="publisher"
              itemScope
              itemType="https://schema.org/Organization"
            >
              <meta content={SITE_NAME} itemProp="name" />
              <meta content={SITE_URL} itemProp="url" />
              <div
                itemProp="logo"
                itemScope
                itemType="https://schema.org/ImageObject"
              >
                <meta content={SITE_LOGO.url} itemProp="url" />
                <meta content={String(SITE_LOGO.width)} itemProp="width" />
                <meta content={String(SITE_LOGO.height)} itemProp="height" />
              </div>
            </div>

            <meta content={post.date} itemProp="dateModified" />
            <meta content={post.locale} itemProp="inLanguage" />
            <meta content="true" itemProp="isAccessibleForFree" />
            <meta content="Technology" itemProp="genre" />
            <meta
              content="AI voice cloning, voice synthesis, machine learning, neural networks, speech technology"
              itemProp="keywords"
            />
          </header>

          {post.image && post.displayImageCover !== false && (
            <figure className="mb-8">
              <Image
                alt={post.title}
                className="mx-auto rounded-lg"
                height={450}
                itemProp="image"
                priority
                src={post.image}
                width={800}
              />
              <figcaption className="mt-2 text-center text-gray-500 text-sm">
                {post.title}
              </figcaption>
            </figure>
          )}

          <div className="prose-headings:scroll-mt-20" itemProp="articleBody">
            <Mdx code={post.body.code} />
          </div>

          {/* Article metadata for AI understanding */}
          <div className="mt-12 border-gray-700 border-t pt-8">
            <div className="mb-4 flex flex-wrap gap-2" itemProp="keywords">
              <span className="font-medium text-gray-300 text-sm">Topics:</span>
              <span className="inline-block rounded bg-blue-900 px-2 py-1 text-blue-200">
                Voice AI
              </span>
              <span className="inline-block rounded bg-blue-900 px-2 py-1 text-blue-200">
                Voice Cloning
              </span>
              <span className="inline-block rounded bg-blue-900 px-2 py-1 text-blue-200">
                Speech Synthesis
              </span>
            </div>

            <div className="text-gray-400 text-sm">
              <p>
                This article is part of our comprehensive guide to AI voice
                technology.
              </p>
            </div>
          </div>
        </article>
      </div>
    </MarketingPage>
  );
};

export default PostLayout;
