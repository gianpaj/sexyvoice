import { defineDocumentType, makeSource } from 'contentlayer2/source-files';
import rehypeHighlight from 'rehype-highlight';
import rehypeHighlightLines from 'rehype-highlight-code-lines';
import remarkGfm from 'remark-gfm';

import type { Locale } from './lib/i18n/i18n-config';
import { routing } from './src/i18n/routing';

const isLocale = (value: string | undefined): value is Locale =>
  Boolean(value && routing.locales.includes(value as Locale));

const getLocale = (path: string) => {
  const pathArray = path.split('.');
  const potentialLocale = pathArray.length > 1 ? pathArray.at(-2) : undefined;
  return isLocale(potentialLocale) ? potentialLocale : routing.defaultLocale;
};

const getBasePath = (path: string) => {
  const parts = path.split('.');

  // remove extension
  parts.pop();

  // remove locale suffix if present
  if (isLocale(parts.at(-1))) {
    parts.pop();
  }

  const joined = parts.join('.');
  const segments = joined.split('/');

  if (segments.length > 1) {
    return segments.slice(1).join('/');
  }

  return joined;
};

const getSlug = (path: string) => {
  const basePath = getBasePath(path);
  const segments = basePath.split('/');
  return segments.at(-1) ?? basePath;
};

const Post = defineDocumentType(() => ({
  computedFields: {
    locale: {
      resolve: (doc) => getLocale(doc._raw.sourceFilePath),
      type: 'string',
    },
    slug: {
      resolve: (doc) => getSlug(doc._raw.sourceFilePath),
      type: 'string',
    },
    slugAsParams: {
      resolve: (doc) => getSlug(doc._raw.sourceFilePath),
      type: 'string',
    },
    url: {
      resolve: (doc) => `/blog/${getSlug(doc._raw.sourceFilePath)}`,
      type: 'string',
    },
  },
  contentType: 'mdx',
  fields: {
    author: {
      description: 'The author of the post',
      required: false,
      type: 'string',
    },
    date: {
      description: 'The date of the post',
      required: true,
      type: 'date',
    },
    description: {
      description: 'The description of the post',
      required: true,
      type: 'string',
    },
    displayImageCover: {
      description: 'Whether to display the image cover',
      required: false,
      type: 'boolean',
    },
    draft: {
      description: 'Whether the post is a draft',
      required: false,
      type: 'boolean',
    },
    image: {
      description: 'The image URL of the post',
      type: 'string',
    },
    keywords: {
      description: 'The keywords of the post',
      of: { type: 'string' },
      required: false,
      type: 'list',
    },
    title: {
      description: 'The title of the post',
      required: true,
      type: 'string',
    },
  },
  filePathPattern: 'posts/**/*.mdx',
  name: 'Post',
}));

const PolicyPage = defineDocumentType(() => ({
  computedFields: {
    locale: {
      resolve: (doc) => getLocale(doc._raw.sourceFilePath),
      type: 'string',
    },
    slug: {
      resolve: (doc) => getSlug(doc._raw.sourceFilePath),
      type: 'string',
    },
    url: {
      resolve: (doc) =>
        `/${getLocale(doc._raw.sourceFilePath)}/${getSlug(doc._raw.sourceFilePath)}`,
      type: 'string',
    },
  },
  contentType: 'mdx',
  fields: {
    description: {
      description: 'Meta description for SEO',
      required: false,
      type: 'string',
    },
    title: {
      description: 'The page title',
      required: true,
      type: 'string',
    },
    updated: {
      description: 'Last updated date text',
      required: true,
      type: 'string',
    },
  },
  filePathPattern: 'policies/**/*.mdx',
  name: 'PolicyPage',
}));

export default makeSource({
  contentDirInclude: ['posts', 'policies'],
  contentDirPath: '.',
  documentTypes: [Post, PolicyPage],
  mdx: {
    rehypePlugins: [rehypeHighlight, rehypeHighlightLines],
    remarkPlugins: [remarkGfm],
  },
});
