import type { PublicRoute } from './render';

export const publicRoutes = {
  audioConverter: {
    load: () => import('@/app/[lang]/tools/audio-converter/page'),
    path: '/tools/audio-converter',
    segments: ['tools', 'audio-converter'],
  },
  audioJoiner: {
    load: () => import('@/app/[lang]/tools/audio-joiner/page'),
    path: '/tools/audio-joiner',
    segments: ['tools', 'audio-joiner'],
  },
  blog: {
    load: () => import('@/app/[lang]/blog/page'),
    path: '/blog',
    segments: ['blog'],
  },
  cliLogin: {
    load: () => import('@/app/[lang]/cli/login/page'),
    path: '/cli/login',
    segments: ['cli', 'login'],
  },
  landing: {
    load: () => import('@/app/[lang]/page'),
    path: '',
    segments: [],
  },
  login: {
    load: () => import('@/app/[lang]/(auth)/login/page'),
    path: '/login',
    segments: ['(auth)', 'login'],
  },
  privacyPolicy: {
    load: () => import('@/app/[lang]/[policySlug]/page'),
    params: { policySlug: 'privacy-policy' },
    path: '/privacy-policy',
    segments: ['[policySlug]'],
  },
  resetPassword: {
    load: () => import('@/app/[lang]/(auth)/reset-password/page'),
    path: '/reset-password',
    segments: ['(auth)', 'reset-password'],
  },
  signup: {
    load: () => import('@/app/[lang]/(auth)/signup/page'),
    path: '/signup',
    segments: ['(auth)', 'signup'],
  },
  terms: {
    load: () => import('@/app/[lang]/[policySlug]/page'),
    params: { policySlug: 'terms' },
    path: '/terms',
    segments: ['[policySlug]'],
  },
  transcribe: {
    load: () => import('@/app/[lang]/tools/transcribe/page'),
    path: '/tools/transcribe',
    segments: ['tools', 'transcribe'],
  },
  voiceCall: {
    load: () => import('@/app/[lang]/voice-call/page'),
    path: '/voice-call',
    segments: ['voice-call'],
  },
  voiceCloning: {
    load: () => import('@/app/[lang]/voice-cloning/page'),
    path: '/voice-cloning',
    segments: ['voice-cloning'],
  },
  wrapped: {
    load: () => import('@/app/[lang]/wrapped/page'),
    path: '/wrapped',
    segments: ['wrapped'],
  },
} satisfies Record<string, PublicRoute>;

export function blogPostRoute(slug: string): PublicRoute {
  return {
    load: () => import('@/app/[lang]/blog/[slug]/page'),
    params: { slug },
    path: `/blog/${slug}`,
    segments: ['blog', '[slug]'],
  };
}
