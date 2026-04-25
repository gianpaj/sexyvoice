import type { Locale } from '@/lib/i18n/i18n-config';
import type { BannerDefinition } from './types';

function getLegacyPromoCookieKeys() {
  if (!process.env.NEXT_PUBLIC_PROMO_ID) {
    return [];
  }

  return [`${process.env.NEXT_PUBLIC_PROMO_ID}-dismissed`];
}

function getPromoDismiss(cookieKey: string) {
  return {
    cookieKey,
    days: 30,
    legacyCookieKeys: getLegacyPromoCookieKeys(),
  };
}

function signupHref(lang: Locale) {
  return `/${lang}/signup`;
}

function creditsHref(lang: Locale) {
  return `/${lang}/dashboard/credits`;
}

export const bannerRegistry = {
  blackFridayBanner: {
    cta: {
      loggedInHref: creditsHref,
      loggedOutHref: signupHref,
    },
    countdown: {
      endDateEnvVar: 'NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE',
    },
    dismiss: getPromoDismiss('banner-black-friday-dismissed'),
    id: 'blackFridayBanner',
    kind: 'promo',
    placements: ['landing', 'dashboard', 'blog'],
    priority: 100,
  },
  expressiveVoicesLaunch: {
    cta: {
      loggedInHref: (lang) => `/${lang}/dashboard/generate`,
      loggedOutHref: (lang) => `/${lang}/login`,
    },
    dismiss: {
      cookieKey: 'banner-expressive-voices-launch-dismissed',
      days: 14,
    },
    id: 'expressiveVoicesLaunch',
    kind: 'announcement',
    placements: ['landing', 'dashboard'],
    priority: 90,
    theme: 'blue',
  },
  halloweenBanner: {
    cta: {
      loggedInHref: creditsHref,
      loggedOutHref: signupHref,
    },
    dismiss: getPromoDismiss('banner-halloween-dismissed'),
    id: 'halloweenBanner',
    kind: 'promo',
    placements: ['landing', 'dashboard', 'blog'],
    priority: 100,
  },
  winterSaleBanner: {
    cta: {
      loggedInHref: creditsHref,
      loggedOutHref: signupHref,
    },
    dismiss: getPromoDismiss('banner-winter-sale-dismissed'),
    id: 'winterSaleBanner',
    kind: 'promo',
    placements: ['landing', 'dashboard', 'blog'],
    priority: 100,
  },
} satisfies Record<string, BannerDefinition>;

export function getBannerDefinition(id: string) {
  return bannerRegistry[id as keyof typeof bannerRegistry];
}
