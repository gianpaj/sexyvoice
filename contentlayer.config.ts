import { defineDocumentType, makeSource } from 'contentlayer2/source-files';

const getLocale = (path: string) => {
  const pathArray = path.split('.');
  return pathArray.length > 2 ? pathArray.slice(-2)[0] : 'en';
};

const getSlug = (path: string) => {
  const pathArray = path.split('.');
  return pathArray[0];
};

const Post = defineDocumentType(() => ({
  name: 'Post',
  filePathPattern: '**/*.mdx',
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
  },
  computedFields: {
    locale: {
      type: 'string',
      resolve: (doc) => {
        return getLocale(doc._raw.sourceFilePath);
      },
    },
    slug: {
      type: 'string',
      resolve: (doc) => {
        return getSlug(doc._raw.sourceFilePath);
      },
    },
    url: {
      type: 'string',
      resolve: (doc) => {
        return `/blog/${doc._raw.flattenedPath}`;
      },
    },
    slugAsParams: {
      type: 'string',
      resolve: (doc) => doc._raw.flattenedPath.split('/').slice(1).join('/'),
    },
  },
}));

export default makeSource({
  contentDirPath: 'posts',
  documentTypes: [Post],
});
