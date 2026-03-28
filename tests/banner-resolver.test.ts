import { afterEach, describe, expect, it } from 'vitest';

import { resolveActiveBanner } from '@/lib/banners/resolve-banner';

const originalEnv = {
  NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER:
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER,
  NEXT_PUBLIC_ACTIVE_PROMO_BANNER: process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER,
  NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE:
    process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE,
  NEXT_PUBLIC_PROMO_ENABLED: process.env.NEXT_PUBLIC_PROMO_ENABLED,
  NEXT_PUBLIC_PROMO_THEME: process.env.NEXT_PUBLIC_PROMO_THEME,
  NEXT_PUBLIC_PROMO_TRANSLATIONS: process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS,
};

const messages = {
  announcements: {
    expressiveVoicesLaunch: {
      ariaLabelDismiss: 'Dismiss announcement',
      ctaLoggedIn: 'Try voices',
      ctaLoggedOut: 'Log in',
      text: 'New expressive voices are live.',
    },
  },
  promos: {
    blackFridayBanner: {
      ariaLabelDismiss: 'Dismiss Black Friday banner',
      countdown: {
        days: 'Days',
        hours: 'Hours',
        minutes: 'Min',
        prefix: 'Deal ends in:',
        seconds: 'Sec',
      },
      ctaLoggedIn: 'Claim offer',
      ctaLoggedOut: 'Claim offer',
      pricing: {
        bannerText: 'Black Friday Sale',
      },
      text: 'Black Friday Sale',
    },
  },
} as IntlMessages;

afterEach(() => {
  process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
    originalEnv.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER;
  process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER =
    originalEnv.NEXT_PUBLIC_ACTIVE_PROMO_BANNER;
  process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE =
    originalEnv.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE;
  process.env.NEXT_PUBLIC_PROMO_ENABLED = originalEnv.NEXT_PUBLIC_PROMO_ENABLED;
  process.env.NEXT_PUBLIC_PROMO_THEME = originalEnv.NEXT_PUBLIC_PROMO_THEME;
  process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS =
    originalEnv.NEXT_PUBLIC_PROMO_TRANSLATIONS;
});

describe('resolveActiveBanner', () => {
  it('returns the active promo banner for the landing page', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = 'blackFridayBanner';
    process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE =
      '2026-12-01T00:00:00.000Z';
    process.env.NEXT_PUBLIC_PROMO_THEME = 'orange';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER = undefined;

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner).toMatchObject({
      ctaLink: '/en/signup',
      ctaText: 'Claim offer',
      id: 'blackFridayBanner',
      theme: 'orange',
    });
    expect(banner?.countdown).toMatchObject({
      enabled: true,
      endDate: '2026-12-01T00:00:00.000Z',
    });
  });

  it('returns the active announcement banner when no promo is active', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = undefined;

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner).toMatchObject({
      ctaLink: '/en/login',
      ctaText: 'Log in',
      id: 'expressiveVoicesLaunch',
      theme: 'blue',
    });
  });

  it('returns the highest-priority banner when promo and announcement are both active', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = 'blackFridayBanner';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner?.id).toBe('blackFridayBanner');
  });

  it('returns null when the active banner is not allowed for the current placement', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = undefined;

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'blog',
    });

    expect(banner).toBeNull();
  });

  it('uses the logged-in CTA target for dashboard announcements', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = undefined;

    const banner = resolveActiveBanner({
      audience: 'loggedIn',
      lang: 'en',
      messages,
      placement: 'dashboard',
    });

    expect(banner).toMatchObject({
      ctaLink: '/en/dashboard/generate',
      ctaText: 'Try voices',
      id: 'expressiveVoicesLaunch',
    });
  });
});
