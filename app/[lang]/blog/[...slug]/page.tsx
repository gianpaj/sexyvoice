import { allPosts } from 'contentlayer/generated';
import { format, parseISO } from 'date-fns';
import Image from 'next/image';
import type { Metadata } from 'next/types';
import { Suspense } from 'react';
import Footer from '@/components/footer';
import { Header } from '@/components/header';
import { Mdx } from '@/components/mdx-components';
import { Locale } from '@/lib/i18n/i18n-config';

export const dynamicParams = false;

export const generateStaticParams = async () =>
  allPosts.map((post) => ({ slug: post._raw.flattenedPath.split('/') }));

interface PostProps {
  params: {
    slug: string[];
  };
}

async function getPostFromParams(params: PostProps['params']) {
  const slug = params.slug.join('/');
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
  params: Promise<{ slug: string[]; tag: string; lang: Locale }>;
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
      <article className="py-8 mx-auto max-w-2xl prose dark:prose-invert">
        <div className="mb-8 text-center">
          <time dateTime={post.date} className="mb-1 text-xs text-gray-600">
            {format(parseISO(post.date), 'LLLL d, yyyy')}
          </time>
          <h1>{post.title}</h1>
        </div>
        {post.image && (
          <Image
            src={post.image}
            alt={post.title}
            className="mx-auto mb-8 rounded-lg"
            width={800}
            height={450}
          />
        )}
        <Mdx code={post.body.code} />
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
