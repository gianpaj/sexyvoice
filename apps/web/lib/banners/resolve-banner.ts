import type { Locale } from '@/lib/i18n/i18n-config';
import { isBannerCountdownExpired } from './countdown';
import { getBannerDefinition } from './registry';
import type {
  BannerAudience,
  BannerDefinition,
  BannerTheme,
  BannerTranslation,
  ResolvedBanner,
} from './types';

interface ResolveActiveBannerOptions {
  audience: BannerAudience;
  dismissedCookieKeys?: Iterable<string>;
  lang: Locale;
  messages: IntlMessages;
  /** Not read: every banner shows on every page. */
  placement?: 'blog' | 'dashboard' | 'landing';
}

const BANNER_THEMES: readonly BannerTheme[] = ['blue', 'orange', 'pink'];

/** Checkout grants promo bonus credits whenever this is on. */
export function isPromoEnabled() {
  return process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';
}

/** The promo campaign to advertise; promos never fall back to a default. */
export function getActivePromoBannerId() {
  return isPromoEnabled()
    ? process.env.NEXT_PUBLIC_ACTIVE_PROMO_BANNER || null
    : null;
}

export function getPromoTheme(): BannerTheme {
  const theme = process.env.NEXT_PUBLIC_PROMO_THEME;
  return BANNER_THEMES.find((candidate) => candidate === theme) ?? 'pink';
}

/** The pricing-table copy of the selected promo campaign. */
export function getActivePromoPricingText(
  messages: IntlMessages,
): string | undefined {
  const promoId = getActivePromoBannerId();
  return promoId && Object.hasOwn(messages.promos, promoId)
    ? messages.promos[promoId as keyof typeof messages.promos].pricing
        .bannerText
    : undefined;
}

function getActiveAnnouncementBannerId() {
  return process.env.NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER || null;
}

function getBannerTranslation(
  definition: BannerDefinition,
  messages: IntlMessages,
): BannerTranslation | null {
  const translations =
    definition.kind === 'promo' ? messages.promos : messages.announcements;
  return Object.hasOwn(translations, definition.id)
    ? (translations[
        definition.id as keyof typeof translations
      ] as BannerTranslation)
    : null;
}

function resolveBanner(
  definition: BannerDefinition,
  options: ResolveActiveBannerOptions,
): ResolvedBanner | null {
  const translation = getBannerTranslation(definition, options.messages);
  if (!translation) {
    return null;
  }

  const countdownEndDate = process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE;
  const countdown =
    definition.countdown && countdownEndDate && translation.countdown
      ? { endDate: countdownEndDate, prefix: translation.countdown.prefix }
      : undefined;

  if (isBannerCountdownExpired(countdown?.endDate)) {
    return null;
  }

  const loggedIn = options.audience === 'loggedIn';
  return {
    ariaLabelDismiss: translation.ariaLabelDismiss,
    artwork: definition.artwork,
    countdown,
    ctaLink: loggedIn
      ? definition.cta.loggedInHref(options.lang)
      : definition.cta.loggedOutHref(options.lang),
    ctaText: loggedIn ? translation.ctaLoggedIn : translation.ctaLoggedOut,
    dismiss: definition.dismiss,
    id: definition.id,
    text: translation.text,
    theme:
      definition.kind === 'promo'
        ? getPromoTheme()
        : (definition.theme ?? 'pink'),
  };
}

/**
 * The one banner to show: the highest-priority active banner whose
 * dismissal cookie is not set.
 */
export function resolveActiveBanner(
  options: ResolveActiveBannerOptions,
): ResolvedBanner | null {
  const dismissedCookieKeys = new Set(options.dismissedCookieKeys ?? []);
  return (
    [getActivePromoBannerId(), getActiveAnnouncementBannerId()]
      .map((bannerId) => (bannerId ? getBannerDefinition(bannerId) : undefined))
      .filter(
        (definition): definition is BannerDefinition =>
          definition !== undefined &&
          !dismissedCookieKeys.has(definition.dismiss.cookieKey),
      )
      .toSorted((a, b) => b.priority - a.priority)
      .map((definition) => resolveBanner(definition, options))
      .find((banner) => banner !== null) ?? null
  );
}
