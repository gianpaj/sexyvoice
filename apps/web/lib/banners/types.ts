import type { Locale } from '@/lib/i18n/i18n-config';

export type BannerAudience = 'loggedIn' | 'loggedOut';
type BannerKind = 'announcement' | 'promo';
export type BannerTheme = 'blue' | 'orange' | 'pink';

interface BannerArtworkImage {
  height: number;
  src: string;
  width: number;
}

/**
 * Background art with decorations at both ends and an empty middle.
 * The mobile image applies below the `sm` breakpoint.
 */
export interface BannerArtwork {
  desktop: BannerArtworkImage;
  mobile: BannerArtworkImage;
}

export interface BannerTranslation {
  ariaLabelDismiss: string;
  countdown?: { prefix: string };
  ctaLoggedIn: string;
  ctaLoggedOut: string;
  text: string;
}

export interface BannerDefinition {
  artwork?: BannerArtwork;
  /**
   * Counts down to `NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE` and hides the
   * banner when it passes.
   */
  countdown?: true;
  cta: {
    loggedInHref: (lang: Locale) => string;
    loggedOutHref: (lang: Locale) => string;
  };
  dismiss: {
    cookieKey: string;
    days: number;
  };
  id: string;
  kind: BannerKind;
  priority: number;
  /** Announcements only; promos take `NEXT_PUBLIC_PROMO_THEME`. */
  theme?: BannerTheme;
}

export interface ResolvedBanner {
  ariaLabelDismiss: string;
  artwork?: BannerArtwork;
  countdown?: {
    endDate: string;
    prefix: string;
  };
  ctaLink: string;
  ctaText: string;
  dismiss: {
    cookieKey: string;
    days: number;
  };
  id: string;
  text: string;
  theme: BannerTheme;
}
