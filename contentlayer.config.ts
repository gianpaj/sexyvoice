import { defineDocumentType, makeSource } from 'contentlayer2/source-files';
import rehypeHighlight from 'rehype-highlight';
import rehypeHighlightLines from 'rehype-highlight-code-lines';
import remarkGfm from 'remark-gfm';

import { i18n, type Locale } from './lib/i18n/i18n-config';

const isLocale = (value: string | undefined): value is Locale =>
  Boolean(value && i18n.locales.includes(value as Locale));

const getLocale = (path: string) => {
  const pathArray = path.split('.');
  const potentialLocale = pathArray.length > 1 ? pathArray.at(-2) : undefined;
  return isLocale(potentialLocale) ? potentialLocale : i18n.defaultLocale;
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
  name: 'Post',
  filePathPattern: 'posts/**/*.mdx',
  contentType: 'mdx',
  fields: {
    title: {
      type: 'string',
      description: 'The title of the post',
      required: true,
    },
    description: {
      type: 'string',
      description: 'The description of the post',
      required: true,
    },
    author: {
      type: 'string',
      description: 'The author of the post',
      required: false,
    },
    keywords: {
      type: 'list',
      of: { type: 'string' },
      description: 'The keywords of the post',
      required: false,
    },
    date: {
      type: 'date',
      description: 'The date of the post',
      required: true,
    },
    image: {
      type: 'string',
      description: 'The image URL of the post',
    },
    displayImageCover: {
      type: 'boolean',
      description: 'Whether to display the image cover',
      required: false,
    },
  },
  computedFields: {
    locale: {
      type: 'string',
      resolve: (doc) => getLocale(doc._raw.sourceFilePath),
    },
    slug: {
      type: 'string',
      resolve: (doc) => getSlug(doc._raw.sourceFilePath),
    },
    url: {
      type: 'string',
      resolve: (doc) => `/blog/${getSlug(doc._raw.sourceFilePath)}`,
    },
    slugAsParams: {
      type: 'string',
      resolve: (doc) => getSlug(doc._raw.sourceFilePath),
    },
  },
}));

const PolicyPage = defineDocumentType(() => ({
  name: 'PolicyPage',
  filePathPattern: 'policies/**/*.mdx',
  contentType: 'mdx',
  fields: {
    title: {
      type: 'string',
      description: 'The page title',
      required: true,
    },
    description: {
      type: 'string',
      description: 'Meta description for SEO',
      required: false,
    },
    updated: {
      type: 'string',
      description: 'Last updated date text',
      required: true,
    },
  },
  computedFields: {
    locale: {
      type: 'string',
      resolve: (doc) => getLocale(doc._raw.sourceFilePath),
    },
    slug: {
      type: 'string',
      resolve: (doc) => getSlug(doc._raw.sourceFilePath),
    },
    url: {
      type: 'string',
      resolve: (doc) =>
        `/${getLocale(doc._raw.sourceFilePath)}/${getSlug(doc._raw.sourceFilePath)}`,
    },
  },
}));

export default makeSource({
  contentDirPath: '.',
  contentDirInclude: ['posts', 'policies'],
  documentTypes: [Post, PolicyPage],
  mdx: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeHighlight, rehypeHighlightLines],
  },
});
