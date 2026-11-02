import type { Article, WithContext } from 'schema-dts';

// Article schema for blog posts
export const createArticleSchema = (
  title: string,
  description: string,
  datePublished: string,
  slug: string,
  locale = 'en',
): WithContext<Article> => ({
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  about: [
    'Voice Cloning',
    'Artificial Intelligence',
    'Speech Synthesis',
    'Machine Learning',
  ],
  articleSection: 'Technology',
  author: {
    '@type': 'Organization',
    name: 'SexyVoice.ai',
    url: 'https://sexyvoice.ai',
  },
  dateModified: datePublished,
  datePublished,
  description,
  headline: title,
  inLanguage: locale,
  isAccessibleForFree: true,
  keywords: [
    'AI voice cloning',
    'voice synthesis',
    'text-to-speech',
    'neural networks',
    'speech generation',
    'voice technology',
  ],
  mainEntity: {
    '@type': 'Thing',
    description:
      'Advanced artificial intelligence technology for replicating and synthesizing human voices',
    name: 'AI Voice Cloning Technology',
  },
  publisher: {
    '@type': 'Organization',
    logo: {
      '@type': 'ImageObject',
      url: 'https://sexyvoice.ai/sexyvoice.png',
    },
    name: 'SexyVoice.ai',
  },
  url: `https://sexyvoice.ai/${locale}/blog/${slug}`,
  wordCount: 2000,
});

// Breadcrumb schema generator
export const createBreadcrumbSchema = (
  items: Array<{ name: string; url: string }>,
) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    item: item.url,
    name: item.name,
    position: index + 1,
  })),
});
