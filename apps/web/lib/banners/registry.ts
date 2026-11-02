import type { Locale } from '@/lib/i18n/i18n-config';
import type { BannerDefinition } from './types';

function getPromoDismiss(cookieKey: string) {
  return {
    cookieKey,
    days: 30,
  };
}

function signupHref(lang: Locale) {
  return `/${lang}/signup`;
}

function creditsHref(lang: Locale) {
  return `/${lang}/dashboard/credits`;
}

const bannerRegistry = {
  blackFridayBanner: {
    countdown: {
      endDateEnvVar: 'NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE',
    },
    cta: {
      loggedInHref: creditsHref,
      loggedOutHref: signupHref,
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
    placements: ['landing', 'dashboard', 'blog'],
    priority: 90,
    theme: 'blue',
  },
  halloweenBanner: {
    artwork: {
      desktop: {
        height: 264,
        src: '/images/banners/halloween-desktop.webp',
        width: 2196,
      },
      mobile: {
        height: 480,
        src: '/images/banners/halloween-mobile.webp',
        width: 1131,
      },
    },
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

export function getBannerDefinition(id: string): BannerDefinition | undefined {
  return bannerRegistry[id as keyof typeof bannerRegistry];
}
