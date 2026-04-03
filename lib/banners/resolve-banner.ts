import type { Locale } from '@/lib/i18n/i18n-config';
import { getBannerDefinition } from './registry';
import type {
  BannerAudience,
  BannerDefinition,
  BannerPlacement,
  BannerTheme,
  BannerTranslation,
  ResolvedBanner,
} from './types';

interface ResolveActiveBannerOptions {
  audience: BannerAudience;
  dismissedCookieKeys?: Iterable<string>;
  lang: Locale;
  messages: IntlMessages;
  placement: BannerPlacement;
}

function getActivePromoBannerId() {
  if (process.env.NEXT_PUBLIC_PROMO_ENABLED !== 'true') {
    return null;
  }

  return (
    process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER ||
    process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS ||
    'blackFridayBanner'
  );
}

function getActiveAnnouncementBannerId() {
  return process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER || null;
}

function getBannerTheme(definition: BannerDefinition): BannerTheme {
  if (definition.kind === 'promo') {
    return (process.env.NEXT_PUBLIC_PROMO_THEME as BannerTheme) || 'pink';
  }

  return definition.theme || 'pink';
}

function getBannerTranslation(
  definition: BannerDefinition,
  messages: IntlMessages,
): BannerTranslation | null {
  if (definition.kind === 'promo') {
    if (!Object.hasOwn(messages.promos, definition.id)) {
      return null;
    }

    return messages.promos[
      definition.id as keyof typeof messages.promos
    ] as BannerTranslation;
  }

  if (!Object.hasOwn(messages.announcements, definition.id)) {
    return null;
  }

  return messages.announcements[
    definition.id as keyof typeof messages.announcements
  ] as BannerTranslation;
}

function resolveBanner(
  definition: BannerDefinition,
  options: ResolveActiveBannerOptions,
): ResolvedBanner | null {
  if (!definition.placements.includes(options.placement)) {
    return null;
  }

  const translation = getBannerTranslation(definition, options.messages);
  if (!translation) {
    return null;
  }

  const countdownEndDate =
    definition.countdown &&
    process.env[definition.countdown.endDateEnvVar] &&
    translation.countdown
      ? process.env[definition.countdown.endDateEnvVar]
      : undefined;

  return {
    ariaLabelDismiss: translation.ariaLabelDismiss,
    countdown: countdownEndDate
      ? {
          enabled: true,
          endDate: countdownEndDate,
          labels: translation.countdown!,
        }
      : undefined,
    ctaLink:
      options.audience === 'loggedIn'
        ? definition.cta.loggedInHref(options.lang)
        : definition.cta.loggedOutHref(options.lang),
    ctaText:
      options.audience === 'loggedIn'
        ? translation.ctaLoggedIn
        : translation.ctaLoggedOut,
    dismissCookieKeys: [
      definition.dismiss.cookieKey,
      ...(definition.dismiss.legacyCookieKeys || []),
    ],
    dismissible: definition.dismissible ?? true,
    id: definition.id,
    kind: definition.kind,
    text: translation.text,
    theme: getBannerTheme(definition),
  };
}

export function resolveActiveBanner(
  options: ResolveActiveBannerOptions,
): ResolvedBanner | null {
  const dismissedCookieKeys = new Set(options.dismissedCookieKeys ?? []);
  const activeBannerIds = [
    getActivePromoBannerId(),
    getActiveAnnouncementBannerId(),
  ].filter((bannerId): bannerId is string => Boolean(bannerId));

  const resolvedBanners = activeBannerIds
    .map((bannerId) => getBannerDefinition(bannerId))
    .filter(
      (banner): banner is NonNullable<ReturnType<typeof getBannerDefinition>> =>
        Boolean(banner),
    )
    .filter((banner) => {
      const bannerCookieKeys = [
        banner.dismiss.cookieKey,
        ...('legacyCookieKeys' in banner.dismiss
          ? banner.dismiss.legacyCookieKeys || []
          : []),
      ];

      return bannerCookieKeys.every(
        (cookieKey) => !dismissedCookieKeys.has(cookieKey),
      );
    })
    .map((banner) => ({
      banner: resolveBanner(banner, options),
      priority: banner.priority,
    }))
    .filter(
      (candidate): candidate is { banner: ResolvedBanner; priority: number } =>
        Boolean(candidate.banner),
    )
    .sort((a, b) => b.priority - a.priority);

  return resolvedBanners[0]?.banner || null;
}
