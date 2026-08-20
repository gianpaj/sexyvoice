---
name: promo-banner
description: Set up promotional banners with optional countdown timers. Use when creating seasonal sales, limited-time offers, or marketing campaigns that need dismissible banners with localized copy and theme customization.
---

# Promo banner setup

Configure a promotional banner through the shared banner registry. Existing
placements already resolve and render the highest-priority active banner.

## Configure the campaign

Set the active registry entry in `apps/web/.env.local` or the deployment
environment:

```bash
# Required
NEXT_PUBLIC_PROMO_ENABLED=true
NEXT_PUBLIC_ACTIVE_PROMO_BANNER=winterSaleBanner

# Optional presentation
NEXT_PUBLIC_PROMO_THEME=pink
NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE=2026-01-31T23:59:59Z

# Only for Stripe metadata and bonus-credit campaigns
NEXT_PUBLIC_PROMO_ID=winter_sale_2026
NEXT_PUBLIC_PROMO_BONUS_STARTER=2000
NEXT_PUBLIC_PROMO_BONUS_STANDARD=7500
NEXT_PUBLIC_PROMO_BONUS_PRO=105000
```

Use `NEXT_PUBLIC_ACTIVE_PROMO_BANNER` for new banners.
`NEXT_PUBLIC_PROMO_TRANSLATIONS` remains a legacy selection fallback.
`NEXT_PUBLIC_PROMO_ID` does not select the banner or name its dismissal
cookie.

## Register the banner

Add the banner to `apps/web/lib/banners/registry.ts`. The `id` must match the
active environment value and the translation key. Give each banner a stable,
unique dismissal cookie.

```ts
yourPromoBanner: {
  countdown: {
    endDateEnvVar: 'NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE',
  },
  cta: {
    loggedInHref: creditsHref,
    loggedOutHref: signupHref,
  },
  dismiss: {
    cookieKey: 'banner-your-promo-dismissed',
    days: 30,
  },
  id: 'yourPromoBanner',
  kind: 'promo',
  placements: ['landing', 'dashboard', 'blog'],
  priority: 100,
},
```

Omit `countdown` when the banner has no deadline. Choose only the placements
where the banner belongs.

## Add localized copy

Add the banner under `promos` in every `apps/web/messages/*.json` file. The
supported locales are `en`, `es`, `de`, `da`, `it`, and `fr`.

```json
{
  "promos": {
    "yourPromoBanner": {
      "text": "Your promotion text",
      "ctaLoggedIn": "Claim offer",
      "ctaLoggedOut": "Sign up now",
      "ariaLabelDismiss": "Dismiss promotion",
      "countdown": {
        "prefix": "Ends in:",
        "days": "Days",
        "hours": "Hours",
        "minutes": "Min",
        "seconds": "Sec"
      },
      "pricing": {
        "bannerText": "Your promotion"
      }
    }
  }
}
```

Omit `countdown` copy when the registry entry has no countdown.

## Rendering and priority

`apps/web/lib/banners/resolve-banner.ts` selects one active banner for each
placement. Promo banners use priority `100`, ahead of ordinary announcements.
Pages pass the resolved value to `apps/web/components/banner.tsx`, so adding a
registry entry does not require another banner component.

Add page wiring only when introducing a new placement. Resolve the banner on
the server and render the shared `Banner` component.

## Theme colors

Set `NEXT_PUBLIC_PROMO_THEME` to `pink`, `orange`, or `blue`. Theme variables
live in `apps/web/app/globals.css` under `[data-promo-theme]` selectors.

When adding a theme, extend `BannerTheme` in
`apps/web/lib/banners/types.ts`, add its CSS variables, and update the example
environment values.

## Dismissal behavior

The registry entry owns the dismissal `cookieKey` and retention period in
`days`. `apps/web/components/banner.tsx` hides the banner immediately and
writes that cookie through `setCookie` in `apps/web/lib/cookies.ts`. The
resolver reads the same cookie on later requests.

Dismissal is entirely client-side. Do not add a Server Action or derive the
cookie name from `NEXT_PUBLIC_PROMO_ID`.

## Checklist

1. Add a registry entry with a unique `id`, `dismiss.cookieKey`, and
   `dismiss.days`.
2. Choose the CTA targets, placements, countdown behavior, and priority.
3. Add matching copy to all six `apps/web/messages/*.json` files.
4. Set `NEXT_PUBLIC_PROMO_ENABLED=true` and
   `NEXT_PUBLIC_ACTIVE_PROMO_BANNER` to the registry id.
5. Set theme, countdown, Stripe metadata, and bonus-credit variables only when
   the campaign needs them.
6. Run `pnpm check-translations`, `pnpm fixall`, and the focused banner tests.
7. Verify dismissal, logged-in and logged-out CTAs, supported placements, and
   countdown expiry before deployment.
