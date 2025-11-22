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
  headline: title,
  description,
  author: {
    '@type': 'Organization',
    name: 'SexyVoice.ai',
    url: 'https://sexyvoice.ai',
  },
  publisher: {
    '@type': 'Organization',
    name: 'SexyVoice.ai',
    logo: {
      '@type': 'ImageObject',
      url: 'https://sexyvoice.ai/sexyvoice.png',
    },
  },
  datePublished,
  dateModified: datePublished,
  url: `https://sexyvoice.ai/${locale}/blog/${slug}`,
  inLanguage: locale,
  about: [
    'Voice Cloning',
    'Artificial Intelligence',
    'Speech Synthesis',
    'Machine Learning',
  ],
  keywords: [
    'AI voice cloning',
    'voice synthesis',
    'text-to-speech',
    'neural networks',
    'speech generation',
    'voice technology',
  ],
  articleSection: 'Technology',
  wordCount: 2000,
  isAccessibleForFree: true,
  mainEntity: {
    '@type': 'Thing',
    name: 'AI Voice Cloning Technology',
    description:
      'Advanced artificial intelligence technology for replicating and synthesizing human voices',
  },
});

// Breadcrumb schema generator
export const createBreadcrumbSchema = (
  items: Array<{ name: string; url: string }>,
) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});
