import { allPosts } from 'contentlayer/generated';
import { format, parseISO } from 'date-fns';
import Image from 'next/image';
import Script from 'next/script';
import type { Metadata } from 'next/types';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { Mdx } from '@/components/mdx-components';
import { PromoBanner } from '@/components/promo-banner';
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
  params: { lang: Locale };
}) =>
  allPosts
    .filter((post) => post.locale === lang)
    .map((post) => ({
      slug: post.slugAsParams,
    }));

interface PostProps {
  params: {
    slug: string;
    lang: Locale;
  };
}

async function getPostFromParams({ slug, lang }: PostProps['params']) {
  const post = allPosts.find(
    (post) => post.slugAsParams === slug && post.locale === lang,
  );

  if (!post) {
    return null;
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
        i18n.locales.map((locale) => [locale, `/${locale}/blog/${post.slug}`]),
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
  const dictHeader = await getDictionary(lang, 'header');
  const promoDictKey =
    process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS || 'blackFridayBanner';
  // @ts-expect-error fix me
  const promoDict = (await getDictionary(lang, 'promos'))[promoDictKey];

  if (!post) {
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
          wordCount,
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

      {promoDict && (
        <PromoBanner
          ariaLabelDismiss={promoDict.ariaLabelDismiss}
          countdown={
            process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE
              ? {
                  enabled: true,
                  endDate: process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE,
                  labels: promoDict.countdown,
                }
              : undefined
          }
          ctaLink={`/${lang}/signup`}
          ctaText={promoDict.ctaLoggedOut}
          isEnabled={process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true'}
          text={promoDict.text}
        />
      )}

      <HeaderStatic dict={dictHeader} lang={lang} />

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

      <main itemScope itemType="https://schema.org/WebPage">
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
                Published: {format(parseISO(post.date), 'LLLL d, yyyy')}
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
                  <span itemProp="name">{post.author || 'SexyVoice.ai'}</span>
                )}
                <meta content="https://sexyvoice.ai" itemProp="url" />
                <meta
                  content="https://sexyvoice.ai/sexyvoice.png"
                  itemProp="logo"
                />
              </div>
            </div>

            {/* Publisher information for LLM extraction */}
            <div
              className="sr-only"
              itemProp="publisher"
              itemScope
              itemType="https://schema.org/Organization"
            >
              <meta content="SexyVoice.ai" itemProp="name" />
              <meta content="https://sexyvoice.ai" itemProp="url" />
              <div
                itemProp="logo"
                itemScope
                itemType="https://schema.org/ImageObject"
              >
                <meta
                  content="https://sexyvoice.ai/sexyvoice.png"
                  itemProp="url"
                />
                <meta content="512" itemProp="width" />
                <meta content="512" itemProp="height" />
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
                Machine Learning
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
      </main>
      <Footer lang={lang} />
    </>
  );
};

export default PostLayout;
