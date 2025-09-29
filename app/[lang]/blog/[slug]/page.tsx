import { allPosts } from 'contentlayer/generated';
import { format, parseISO } from 'date-fns';
import Image from 'next/image';
import Script from 'next/script';
import type { Metadata } from 'next/types';
import { Suspense } from 'react';

import Footer from '@/components/footer';
import { HalloweenBanner } from '@/components/halloween-banner';
import { Header } from '@/components/header';
import { Mdx } from '@/components/mdx-components';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import {
  createArticleSchema,
  createBreadcrumbSchema,
} from '@/lib/structured-data';

export const dynamicParams = false;

export const generateStaticParams = ({
  params: { lang },
}: {
  params: { lang: string };
}) =>
  allPosts
    .map((post) => {
      // Determine locale from file extension or default to 'en'
      const locale = i18n.locales.find((loc) =>
        post._raw.flattenedPath.endsWith(`.${loc}`)
      ) || i18n.defaultLocale;

      return {
        slug: post._raw.flattenedPath,
        locale,
      };
    })
    .filter((post) => post.locale === lang);

interface PostProps {
  params: {
    slug: string;
    lang: Locale;
  };
}

async function getPostFromParams(params: PostProps['params']) {
  const slug = params.slug;
  const post = allPosts.find((post) => post._raw.flattenedPath === slug);

  if (!post) {
    null;
  }

  return post;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PostProps['params']>;
}): Promise<Metadata> {
  const paramsData = await params;
  const post = await getPostFromParams(paramsData);

  if (!post) {
    return {};
  }

  const postUrl = `https://sexyvoice.ai/${post.locale}/blog/${post.slug}`;

  return {
    title: `${post.title} - SexyVoice.ai`,
    description: post.description,
    keywords: post.keywords || [
      'AI voice generation',
      'voice cloning',
      'text-to-speech',
      'voice synthesis',
      'artificial intelligence',
      'machine learning',
      'neural networks',
      'speech technology',
    ],
    authors: [{ name: 'SexyVoice.ai' }],
    openGraph: {
      title: post.title,
      description: post.description,
      url: postUrl,
      siteName: 'SexyVoice.ai',
      images: [
        {
          url: post.image || '/sexyvoice.ai-og-image.jpg',
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
      locale: post.locale,
      type: 'article',
      publishedTime: post.date,
      section: 'Technology',
      tags: ['Voice AI', 'Machine Learning', 'Speech Synthesis'],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [post.image || '/sexyvoice.ai-og-image.jpg'],
    },
    alternates: {
      canonical: postUrl,
      languages: Object.fromEntries(
        i18n.locales.map((locale) => [
          locale,
          `/${locale}/blog/${post.slug}`,
        ])
      ),
    },
  };
}

const PostLayout = async (props: {
  params: Promise<{ slug: string; tag: string; lang: Locale }>;
}) => {
  const params = await props.params;
  const { lang } = params;
  const post = await getPostFromParams(params);
  const halloweenDict = await getDictionary(lang, 'halloween');

  if (post === undefined) {
    return <div>Post not found ({params.slug})</div>;
  }

  // Generate structured data for better LLM understanding
  const articleSchema = createArticleSchema(
    post.title,
    post.description,
    post.date,
    post.slug,
    post.locale,
  );

  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home', url: `https://sexyvoice.ai/${lang}` },
    // { name: 'Blog', url: `https://sexyvoice.ai/${lang}/blog` },
    {
      name: post.title,
      url: `https://sexyvoice.ai/${post.locale}/blog/${post.slug}`,
    },
  ]);

  const wordCount = post.body.raw
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  const readingTime = Math.ceil(wordCount / 200); // Average reading speed

  return (
    <>
      {/* Enhanced Structured Data for LLM Understanding */}
      <Script id="article-schema" type="application/ld+json">
        {JSON.stringify({
          ...articleSchema,
          wordCount: wordCount,
          timeRequired: `PT${readingTime}M`,
          about: [
            {
              '@type': 'Thing',
              name: 'AI Voice Cloning',
              description:
                'Artificial intelligence technology for replicating human voices',
            },
            {
              '@type': 'Thing',
              name: 'Speech Synthesis',
              description: 'Computer generation of human-like speech from text',
            },
            {
              '@type': 'Thing',
              name: 'Machine Learning',
              description: 'AI algorithms that learn patterns from data',
            },
          ],
          mainEntity: {
            '@type': 'TechArticle',
            name: post.title,
            description: post.description,
            proficiencyLevel: 'Beginner to Advanced',
            dependencies: 'Basic understanding of AI concepts',
          },
        })}
      </Script>

      <Script id="breadcrumb-schema" type="application/ld+json">
        {JSON.stringify(breadcrumbSchema)}
      </Script>

      <HalloweenBanner
        lang={lang}
        text={halloweenDict.banner.text}
        ctaText={halloweenDict.banner.ctaLoggedOut}
        ctaLink={`/${lang}/signup`}
        isEnabled={process.env.NEXT_PUBLIC_HALLOWEEN_PROMO_ENABLED === 'true'}
      />

      <Suspense fallback={<div>Loading...</div>}>
        <Header lang={lang} />
      </Suspense>

      {/* Semantic content structure for AI extraction */}
      <div
        className="sr-only"
        itemScope
        itemType="https://schema.org/TechArticle"
      >
        <h1 itemProp="name">{post.title}</h1>
        <div itemProp="abstract">{post.description}</div>
        <div itemProp="about">
          This article covers advanced concepts in AI voice generation,
          including neural networks, machine learning algorithms, voice
          synthesis techniques, and practical applications of artificial
          intelligence in speech technology.
        </div>
        <meta
          itemProp="audience"
          content="Developers, AI researchers, content creators"
        />
        <meta itemProp="educationalLevel" content="Intermediate to Advanced" />
        <meta itemProp="learningResourceType" content="Tutorial" />
      </div>

      <main itemScope itemType="https://schema.org/WebPage">
        <article
          className="py-8 px-4 md:px-0 md:mx-auto max-w-2xl prose dark:prose-invert"
          itemScope
          itemType="https://schema.org/BlogPosting"
          itemProp="mainEntity"
        >
          <header className="text-center my-8">
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

            <div className="flex items-center justify-center space-x-4 mb-4 text-xs text-gray-600">
              <time
                dateTime={post.date}
                itemProp="datePublished"
                content={post.date}
              >
                Published: {format(parseISO(post.date), 'LLLL d, yyyy')}
              </time>
              <span>•</span>
              <span itemProp="timeRequired" content={`PT${readingTime}M`}>
                {readingTime} min read
              </span>
              <span>•</span>
              <span itemProp="wordCount">{wordCount} words</span>
            </div>

            <h1 itemProp="headline" className="mb-4 mt-12">
              {post.title}
            </h1>

            <div
              itemProp="description"
              className="mt-8 text-lg text-gray-400 mb-6"
            >
              {post.description}
            </div>

            {/* Enhanced author and publisher information */}
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
              <span>By</span>
              <div
                itemProp="author"
                itemScope
                itemType="https://schema.org/Organization"
              >
                <span itemProp="name">SexyVoice.ai</span>
                <meta itemProp="url" content="https://sexyvoice.ai" />
                <meta
                  itemProp="logo"
                  content="https://sexyvoice.ai/sexyvoice.png"
                />
              </div>
            </div>

            {/* Publisher information for LLM extraction */}
            <div
              itemProp="publisher"
              itemScope
              itemType="https://schema.org/Organization"
              className="sr-only"
            >
              <meta itemProp="name" content="SexyVoice.ai" />
              <meta itemProp="url" content="https://sexyvoice.ai" />
              <div
                itemProp="logo"
                itemScope
                itemType="https://schema.org/ImageObject"
              >
                <meta
                  itemProp="url"
                  content="https://sexyvoice.ai/sexyvoice.png"
                />
                <meta itemProp="width" content="512" />
                <meta itemProp="height" content="512" />
              </div>
            </div>

            <meta itemProp="dateModified" content={post.date} />
            <meta itemProp="inLanguage" content={post.locale} />
            <meta itemProp="isAccessibleForFree" content="true" />
            <meta itemProp="genre" content="Technology" />
            <meta
              itemProp="keywords"
              content="AI voice cloning, voice synthesis, machine learning, neural networks, speech technology"
            />
          </header>

          {post.image && (
            <figure className="mb-8">
              <Image
                src={post.image}
                alt={post.title}
                className="mx-auto rounded-lg"
                width={800}
                height={450}
                itemProp="image"
                priority
              />
              <figcaption className="text-center text-sm text-gray-500 mt-2">
                {post.title}
              </figcaption>
            </figure>
          )}

          <div itemProp="articleBody" className="prose-headings:scroll-mt-20">
            <Mdx code={post.body.code} />
          </div>

          {/* Article metadata for AI understanding */}
          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-2 mb-4" itemProp="keywords">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Topics:
              </span>
              <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded">
                Voice AI
              </span>
              <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded">
                Machine Learning
              </span>
              <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded">
                Speech Synthesis
              </span>
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>
                This article is part of our comprehensive guide to AI voice
                technology.
              </p>
            </div>
          </div>
        </article>
      </main>
      <Footer lang={lang} />
    </>
  );
};

export default PostLayout;
