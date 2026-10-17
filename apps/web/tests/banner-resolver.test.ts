import { afterEach, describe, expect, it, vi } from 'vitest';

// biome-ignore lint/performance/noNamespaceImport: Vitest needs the module namespace to spy on the registry export
import * as bannerRegistry from '@/lib/banners/registry';
import {
  getActivePromoBannerId,
  resolveActiveBanner,
} from '@/lib/banners/resolve-banner';

const originalEnv = {
  NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER:
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER,
  NEXT_PUBLIC_ACTIVE_PROMO_BANNER: process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER,
  NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE:
    process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE,
  NEXT_PUBLIC_PROMO_ENABLED: process.env.NEXT_PUBLIC_PROMO_ENABLED,
  NEXT_PUBLIC_PROMO_ID: process.env.NEXT_PUBLIC_PROMO_ID,
  NEXT_PUBLIC_PROMO_THEME: process.env.NEXT_PUBLIC_PROMO_THEME,
  NEXT_PUBLIC_PROMO_TRANSLATIONS: process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS,
};

type EnvKey = keyof typeof originalEnv;

function setEnv(name: EnvKey, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function unsetEnv(name: EnvKey) {
  setEnv(name, undefined);
}

const messages = {
  announcements: {
    expressiveVoicesLaunch: {
      ariaLabelDismiss: 'Dismiss announcement',
      ctaLoggedIn: 'Try voices',
      ctaLoggedOut: 'Log in',
      text: 'Generate with new expressive voices.',
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
  vi.restoreAllMocks();

  for (const name of Object.keys(originalEnv) as EnvKey[]) {
    setEnv(name, originalEnv[name]);
  }
});

describe('getActivePromoBannerId', () => {
  it('uses the active banner id before the legacy translation id', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = 'currentPromo';
    process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS = 'legacyPromo';

    expect(getActivePromoBannerId()).toBe('currentPromo');

    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = '';

    expect(getActivePromoBannerId()).toBe('legacyPromo');
  });
});

describe('resolveActiveBanner', () => {
  it('returns the active promo banner for the landing page', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = 'blackFridayBanner';
    process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE =
      '2026-12-01T00:00:00.000Z';
    process.env.NEXT_PUBLIC_PROMO_THEME = 'orange';
    unsetEnv('NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER');

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

  it('uses the default promo id and theme when no overrides are configured', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');
    unsetEnv('NEXT_PUBLIC_PROMO_TRANSLATIONS');
    unsetEnv('NEXT_PUBLIC_PROMO_THEME');
    unsetEnv('NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner).toMatchObject({
      id: 'blackFridayBanner',
      theme: 'pink',
    });
  });

  it('returns the active announcement banner when no promo is active', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner).toMatchObject({
      ctaLink: '/en/login',
      ctaText: 'Log in',
      dismiss: {
        cookieKey: 'banner-expressive-voices-launch-dismissed',
        days: 14,
      },
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

  it('falls back to the next active banner when the higher-priority banner is dismissed', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = 'blackFridayBanner';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      dismissedCookieKeys: ['banner-black-friday-dismissed'],
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

  it('ignores expired legacy promo dismissal cookies', async () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = 'blackFridayBanner';
    unsetEnv('NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER');
    process.env.NEXT_PUBLIC_PROMO_ID = 'legacy-promo';
    vi.resetModules();
    const { resolveActiveBanner: resolveWithPromoId } = await import(
      '@/lib/banners/resolve-banner'
    );

    const banner = resolveWithPromoId({
      audience: 'loggedOut',
      dismissedCookieKeys: ['legacy-promo-dismissed'],
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner?.id).toBe('blackFridayBanner');
  });

  it('returns the active announcement banner for the blog', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'blog',
    });

    expect(banner).toMatchObject({
      ctaLink: '/en/login',
      ctaText: 'Log in',
      id: 'expressiveVoicesLaunch',
    });
  });

  it('returns null when no banner is active', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    unsetEnv('NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER');
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner).toBeNull();
  });

  it('returns null when the active banner is unknown', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER = 'unknownBanner';
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner).toBeNull();
  });

  it('returns null when the active promo translation is missing', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER = 'blackFridayBanner';
    unsetEnv('NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages: { ...messages, promos: {} } as IntlMessages,
      placement: 'landing',
    });

    expect(banner).toBeNull();
  });

  it('returns null when the active announcement translation is missing', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages: { ...messages, announcements: {} } as IntlMessages,
      placement: 'landing',
    });

    expect(banner).toBeNull();
  });

  it('returns null when the only active banner is dismissed', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      dismissedCookieKeys: ['banner-expressive-voices-launch-dismissed'],
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner).toBeNull();
  });

  it('returns null when the active banner does not support the placement', () => {
    const definition = bannerRegistry.getBannerDefinition(
      'expressiveVoicesLaunch',
    );
    if (!definition) {
      throw new Error('Expected expressiveVoicesLaunch banner definition');
    }

    vi.spyOn(bannerRegistry, 'getBannerDefinition').mockReturnValue({
      ...definition,
      placements: ['landing', 'dashboard'],
    });

    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'blog',
    });

    expect(banner).toBeNull();
  });

  it('uses the default announcement theme and explicit dismissibility', () => {
    const definition = bannerRegistry.getBannerDefinition(
      'expressiveVoicesLaunch',
    );
    if (!definition) {
      throw new Error('Expected expressiveVoicesLaunch banner definition');
    }

    vi.spyOn(bannerRegistry, 'getBannerDefinition').mockReturnValue({
      ...definition,
      dismissible: false,
      theme: undefined,
    });

    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');

    const banner = resolveActiveBanner({
      audience: 'loggedOut',
      lang: 'en',
      messages,
      placement: 'landing',
    });

    expect(banner).toMatchObject({
      dismissible: false,
      theme: 'pink',
    });
  });

  it('uses the logged-in CTA target for dashboard announcements', () => {
    process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';
    process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER =
      'expressiveVoicesLaunch';
    unsetEnv('NEXT_PUBLIC_ACTIVE_PROMO_BANNER');

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
