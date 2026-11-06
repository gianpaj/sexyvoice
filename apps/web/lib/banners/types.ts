import type { Locale } from '@/lib/i18n/i18n-config';

export type BannerAudience = 'loggedIn' | 'loggedOut';
export type BannerKind = 'announcement' | 'promo';
export type BannerPlacement = 'blog' | 'dashboard' | 'landing';
export type BannerTheme = 'blue' | 'orange' | 'pink';

export interface BannerArtworkImage {
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

export interface BannerCountdownLabels {
  days: string;
  hours: string;
  minutes: string;
  prefix: string;
  seconds: string;
}

export interface BannerTranslation {
  ariaLabelDismiss: string;
  countdown?: BannerCountdownLabels;
  ctaLoggedIn: string;
  ctaLoggedOut: string;
  text: string;
}

export interface BannerDefinition {
  artwork?: BannerArtwork;
  countdown?: {
    endDateEnvVar: string;
  };
  cta: {
    loggedInHref: (lang: Locale) => string;
    loggedOutHref: (lang: Locale) => string;
  };
  dismiss: {
    cookieKey: string;
    days: number;
  };
  dismissible?: boolean;
  id: string;
  kind: BannerKind;
  placements: BannerPlacement[];
  priority: number;
  theme?: BannerTheme;
}

export interface ResolvedBanner {
  ariaLabelDismiss: string;
  artwork?: BannerArtwork;
  countdown?: {
    enabled: boolean;
    endDate: string;
    labels: BannerCountdownLabels;
  };
  ctaLink: string;
  ctaText: string;
  dismiss: {
    cookieKey: string;
    days: number;
  };
  dismissible: boolean;
  id: string;
  kind: BannerKind;
  text: string;
  theme: BannerTheme;
}
