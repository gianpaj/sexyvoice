import type { PolicyPage, Post } from 'contentlayer/generated';

// Stand-ins for the Contentlayer output, shaped like `.contentlayer/generated`.
// Each post covers one listing rule: translated, untranslated, without a cover
// image, and a draft.

// Compiled MDX shared by every fixture; the markdown routes read `raw`.
const MDX_CODE =
  "return { default: () => _jsx_runtime.jsx('p', { children: 'Body' }) };";

function mdxBody(text: string) {
  return { code: MDX_CODE, raw: `${text}\n` };
}

function rawData(dir: string, file: string) {
  return {
    contentType: 'mdx' as const,
    flattenedPath: `${dir}/${file.replace(/\.mdx$/, '')}`,
    sourceFileDir: dir,
    sourceFileName: file,
    sourceFilePath: `${dir}/${file}`,
  };
}

function localeAndSlug(file: string) {
  const [slug, locale = 'en'] = file.replace(/\.mdx$/, '').split('.');
  return { locale, slug };
}

function post(
  file: string,
  fields: Omit<Post, '_id' | '_raw' | 'body' | 'locale' | 'slug' | 'type'>,
): Post {
  const { locale, slug } = localeAndSlug(file);
  return {
    ...fields,
    _id: `posts/${file}`,
    _raw: rawData('posts', file),
    body: mdxBody(`Body of ${slug} in ${locale}.`),
    locale,
    slug,
    type: 'Post',
  };
}

function policy(
  file: string,
  fields: Pick<PolicyPage, 'description' | 'title' | 'updated'>,
): PolicyPage {
  const { locale, slug } = localeAndSlug(file);
  return {
    ...fields,
    _id: `policies/${file}`,
    _raw: rawData('policies', file),
    body: mdxBody(`${fields.title} body.`),
    locale,
    slug,
    type: 'PolicyPage',
  };
}

export const allPosts: Post[] = [
  post('hello-from-sexyvoice.mdx', {
    date: '2025-04-28T00:00:00.000Z',
    description: 'Next-gen voice AI for synthesis and dubbing.',
    image: '/sexyvoice.png',
    keywords: ['SexyVoice.ai', 'AI voice generation'],
    title: 'Hello from SexyVoice.ai',
  }),
  post('hello-from-sexyvoice.es.mdx', {
    date: '2025-04-28T00:00:00.000Z',
    description: 'IA de voz de nueva generación para síntesis y doblaje.',
    image: '/sexyvoice.png',
    keywords: ['SexyVoice.ai', 'generación de voz con IA'],
    title: 'Hola desde SexyVoice.ai',
  }),
  post('realtime-ai-voice-call.mdx', {
    author: 'Gianfranco',
    date: '2026-01-15T00:00:00.000Z',
    description: 'Talk to AI characters in real time.',
    image: '/posts/realtime-ai-voice-call.webp',
    title: 'Real-time AI Voice Calls',
  }),
  post('realtime-ai-voice-call.de.mdx', {
    author: 'Gianfranco',
    date: '2026-01-15T00:00:00.000Z',
    description: 'Sprich in Echtzeit mit KI-Charakteren.',
    image: '/posts/realtime-ai-voice-call.webp',
    title: 'KI-Sprachanrufe in Echtzeit',
  }),
  post('voice-ai-glossary.mdx', {
    date: '2025-06-27T00:00:00.000Z',
    description: 'The definitive glossary of voice AI terminology.',
    keywords: ['voice AI glossary'],
    title: 'Voice AI Glossary',
  }),
  post('free-audio-joiner-tool.mdx', {
    date: '2026-03-03T00:00:00.000Z',
    description: 'Trim and join audio files in your browser.',
    displayImageCover: false,
    draft: true,
    image: '/posts/free-audio-joiner-tool-landscape.webp',
    title: 'Free Audio Joiner',
  }),
];

export const allPolicyPages: PolicyPage[] = [
  policy('privacy-policy.mdx', {
    description: 'How SexyVoice.ai handles data.',
    title: 'Privacy Policy',
    updated: '2026-11-03',
  }),
  policy('privacy-policy.es.mdx', {
    description: 'Cómo SexyVoice.ai gestiona los datos.',
    title: 'Política de Privacidad',
    updated: '2026-11-03',
  }),
  policy('terms.mdx', {
    description: 'Terms governing the use of SexyVoice.ai.',
    title: 'Terms & Conditions',
    updated: '2026-07-15',
  }),
  policy('terms.es.mdx', {
    description: 'Términos que rigen el uso de SexyVoice.ai.',
    title: 'Términos y Condiciones',
    updated: '2026-07-15',
  }),
];
