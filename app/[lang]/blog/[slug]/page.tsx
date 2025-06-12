import { allPosts } from 'contentlayer/generated';
import { format, parseISO } from 'date-fns';
import Image from 'next/image';
import type { Metadata } from 'next/types';
import { Suspense } from 'react';
import Footer from '@/components/footer';
import { Header } from '@/components/header';
import { Mdx } from '@/components/mdx-components';
import type { Locale } from '@/lib/i18n/i18n-config';

export const dynamicParams = false;

export const generateStaticParams = ({
  params: { lang },
}: {
  params: { lang: string };
}) =>
  allPosts
    .map((post) => ({
      slug: post._raw.flattenedPath,
      locale: post._raw.flattenedPath.endsWith('.es') ? 'es' : 'en',
    }))
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

  return {
    title: `${post.title} - SexyVoice.ai`,
    description: post.description,
  };
}

const PostLayout = async (props: {
  params: Promise<{ slug: string; tag: string; lang: Locale }>;
}) => {
  const params = await props.params;
  const { lang } = params;
  const post = await getPostFromParams(params);

  if (post === undefined) {
    return <div>Post not found ({params.slug})</div>;
  }

  return (
    <>
      <link
        rel="preconnect"
        href="https://uxjubqdyhv4aowsi.public.blob.vercel-storage.com"
      />
      <Suspense fallback={<div>Loading...</div>}>
        <Header lang={lang} />
      </Suspense>
      <article
        className="py-8 mx-auto max-w-2xl prose dark:prose-invert"
        itemScope
        itemType="https://schema.org/BlogPosting"
      >
        <div className="mb-8 text-center">
          <time
            dateTime={post.date}
            className="mb-1 text-xs text-gray-600"
            itemProp="datePublished"
            content={post.date}
          >
            {format(parseISO(post.date), 'LLLL d, yyyy')}
          </time>
          <h1 itemProp="headline">{post.title}</h1>
          <meta itemProp="description" content={post.description} />
          <div
            itemProp="author"
            itemScope
            itemType="https://schema.org/Organization"
          >
            <meta itemProp="name" content="SexyVoice.ai" />
            <meta itemProp="url" content="https://sexyvoice.ai" />
          </div>
          <div
            itemProp="publisher"
            itemScope
            itemType="https://schema.org/Organization"
          >
            <meta itemProp="name" content="SexyVoice.ai" />
            <meta itemProp="url" content="https://sexyvoice.ai" />
          </div>
        </div>
        {post.image && (
          <Image
            src={post.image}
            alt={post.title}
            className="mx-auto mb-8 rounded-lg"
            width={800}
            height={450}
            itemProp="image"
          />
        )}
        <div itemProp="articleBody">
          <Mdx code={post.body.code} />
        </div>
        {/*
        <div className="mt-8">
          <h2 className="mb-2 text-lg font-bold">Related Posts</h2>
            <ul className="flex flex-wrap gap-4">
          {post.tags.map((tag) => (
            <li key={tag} className="bg-gray-100 rounded-md px-2 py-1 text-sm">
              {tag}
            </li>
          ))}
        </ul>
        </div>
        */}
      </article>
      <Footer />
    </>
  );
};

export default PostLayout;
