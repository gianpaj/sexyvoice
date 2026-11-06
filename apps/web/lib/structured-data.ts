import type {
  BreadcrumbList,
  FAQPage,
  Graph,
  HowTo,
  ItemList,
  Organization,
  TechArticle,
  Thing,
  WebApplication,
  WebPage,
  WebSite,
} from 'schema-dts';

import type { Locale } from '@/lib/i18n/i18n-config';
import {
  localeUrl,
  SITE_LOGO,
  SITE_NAME,
  SITE_URL,
  SOCIAL_LINKS,
} from '@/lib/site';

// Schema.org nodes for the public pages. Each page publishes one graph, and
// nodes link to the organization and website by `@id`.

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

interface LocalePage {
  lang: Locale;
  /** The part of the URL after the locale prefix, `/` for the landing page. */
  path: string;
}

export function graph(...nodes: Thing[]): Graph {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

export function organization(): Organization {
  return {
    '@id': ORGANIZATION_ID,
    '@type': 'Organization',
    logo: SITE_LOGO.url,
    name: SITE_NAME,
    sameAs: Object.values(SOCIAL_LINKS),
    url: SITE_URL,
  };
}

export function webSite({
  description,
  lang,
}: {
  description: string;
  lang: Locale;
}): WebSite {
  return {
    '@id': WEBSITE_ID,
    '@type': 'WebSite',
    description,
    inLanguage: lang,
    name: SITE_NAME,
    publisher: { '@id': ORGANIZATION_ID },
    url: SITE_URL,
  };
}

export function webPage({
  description,
  lang,
  name,
  path,
}: LocalePage & { description: string; name: string }) {
  const url = localeUrl(lang, path);
  return {
    '@id': `${url}/#webpage`,
    '@type': 'WebPage',
    about: { '@id': ORGANIZATION_ID },
    description,
    inLanguage: lang,
    isPartOf: { '@id': WEBSITE_ID },
    name,
    url,
  } satisfies WebPage;
}

export function faqPage({
  isPartOf,
  lang,
  path,
  questions,
}: LocalePage & {
  /** The page node the questions belong to, when the graph has one. */
  isPartOf?: { '@id': string };
  questions: Array<{ answer: string; question: string }>;
}): FAQPage {
  return {
    '@id': `${localeUrl(lang, path)}/#faq`,
    '@type': 'FAQPage',
    inLanguage: lang,
    ...(isPartOf && { isPartOf: { '@id': isPartOf['@id'] } }),
    mainEntity: questions.map(({ answer, question }) => ({
      '@type': 'Question',
      acceptedAnswer: { '@type': 'Answer', text: answer },
      name: question,
    })),
  };
}

/** A free tool that runs in the browser. */
export function webApplication({
  description,
  extra,
  lang,
  name,
  path,
}: LocalePage & {
  description: string;
  extra?: Pick<
    WebApplication,
    'applicationSubCategory' | 'featureList' | 'screenshot'
  >;
  name: string;
}): WebApplication {
  const url = localeUrl(lang, path);
  return {
    '@id': `${url}/#webapp`,
    '@type': 'WebApplication',
    applicationCategory: 'MultimediaApplication',
    ...extra,
    browserRequirements: 'Requires a modern browser with WebAssembly support',
    description,
    inLanguage: lang,
    isAccessibleForFree: true,
    name,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    operatingSystem: 'Any',
    publisher: { '@id': ORGANIZATION_ID },
    url,
  };
}

export function howTo({
  description,
  lang,
  name,
  path,
  steps,
  totalTime,
}: LocalePage & {
  description: string;
  name: string;
  steps: Array<{ name: string; text: string }>;
  totalTime: string;
}): HowTo {
  const url = localeUrl(lang, path);
  return {
    '@id': `${url}/#howto`,
    '@type': 'HowTo',
    description,
    inLanguage: lang,
    name,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      name: step.name,
      position: index + 1,
      text: step.text,
      url,
    })),
    totalTime,
  };
}

/** Crumbs from the landing page down to the current page. */
export function breadcrumbList(
  lang: Locale,
  crumbs: Array<{ name: string; path: string }>,
): BreadcrumbList {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      item: localeUrl(lang, crumb.path),
      name: crumb.name,
      position: index + 1,
    })),
  };
}

export function itemList({
  items,
  lang,
  name,
  path,
}: LocalePage & {
  items: Array<{ name: string; path: string }>;
  name: string;
}): ItemList {
  return {
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      name: item.name,
      position: index + 1,
      url: localeUrl(lang, item.path),
    })),
    name,
    numberOfItems: items.length,
    url: localeUrl(lang, path),
  };
}

export function techArticle({
  date,
  description,
  lang,
  path,
  readingMinutes,
  title,
  wordCount,
}: LocalePage & {
  date: string;
  description: string;
  readingMinutes: number;
  title: string;
  wordCount: number;
}): TechArticle {
  return {
    '@type': 'TechArticle',
    about: [
      {
        '@type': 'Thing',
        description:
          'Artificial intelligence technology for replicating human voices',
        name: 'AI Voice Cloning',
      },
      {
        '@type': 'Thing',
        description: 'Computer generation of human-like speech from text',
        name: 'Speech Synthesis',
      },
      {
        '@type': 'Thing',
        description: 'AI algorithms that learn patterns from data',
        name: 'Machine Learning',
      },
    ],
    articleSection: 'Technology',
    author: { '@id': ORGANIZATION_ID },
    dateModified: date,
    datePublished: date,
    description,
    headline: title,
    inLanguage: lang,
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
      '@type': 'TechArticle',
      dependencies: 'Basic understanding of AI concepts',
      description,
      name: title,
      proficiencyLevel: 'Beginner to Advanced',
    },
    publisher: { '@id': ORGANIZATION_ID },
    timeRequired: `PT${readingMinutes}M`,
    url: localeUrl(lang, path),
    wordCount,
  };
}
