---
name: promo-banner
description: Set up promotional banners with optional countdown timers. Use when creating seasonal sales, limited-time offers, or marketing campaigns that need dismissable banners with i18n support and theme customization.
---

# Promo Banner Setup

Configure promotional banners across landing pages and dashboard.

## Environment Variables

Add to `.env` or deployment environment:

```bash
# Required
NEXT_PUBLIC_PROMO_ENABLED=true
NEXT_PUBLIC_PROMO_ID=winter_sale_2026          # Unique ID for cookie tracking
NEXT_PUBLIC_PROMO_TRANSLATIONS=winterSaleBanner # Translation key in promos dict

# Optional
NEXT_PUBLIC_PROMO_THEME=pink                    # pink (default), orange, or blue
NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE=2026-01-31T23:59:59Z  # UTC ISO 8601

# Bonus credits (if applicable)
NEXT_PUBLIC_PROMO_BONUS_STARTER=2000
NEXT_PUBLIC_PROMO_BONUS_STANDARD=7500
NEXT_PUBLIC_PROMO_BONUS_PRO=105000
```

## Add Translations

Add banner translations to each locale file in `lib/i18n/dictionaries/{lang}.json` under the `promos` key:

```json
{
  "promos": {
    "yourPromoBanner": {
      "text": "🎉 Your Promo – Get up to 35% extra credits!\nLimited time offer",
      "ctaLoggedIn": "Claim offer",
      "ctaLoggedOut": "Sign up Now",
      "ariaLabelDismiss": "Dismiss promo banner",
      "countdown": {
        "prefix": "Ends in:",
        "days": "Days",
        "hours": "Hours",
        "minutes": "Min",
        "seconds": "Sec"
      },
      "pricing": {
        "bannerText": "🎉 Your Promo"
      }
    }
  }
}
```

Repeat for `en.json`, `es.json`, `de.json`, and other supported locales.

## Component Usage

The `PromoBanner` component is already integrated in:
- `app/[lang]/page.tsx` (landing page)
- `app/[lang]/(dashboard)/dashboard.ui.tsx` (dashboard)
- `app/[lang]/blog/[slug]/page.tsx` (blog pages)

Props:
```tsx
<PromoBanner
  text={promoDict.text}
  ctaLink={`/${lang}/signup`}           // or /dashboard/credits for logged-in
  ctaText={promoDict.ctaLoggedOut}      // or ctaLoggedIn
  ariaLabelDismiss={promoDict.ariaLabelDismiss}
  isEnabled={process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true'}
  inDashboard={false}                   // true for fixed positioning in dashboard
  countdown={                           // optional
    process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE
      ? {
          enabled: true,
          endDate: process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE,
          labels: promoDict.countdown,
        }
      : undefined
  }
/>
```

## Theme Colors

Available themes in `app/globals.css`:

| Theme  | Primary Color |
|--------|---------------|
| pink   | Pink 500/600  |
| orange | Orange 500/600|
| blue   | Custom purple |

Add new themes by extending the CSS variables:

```css
[data-promo-theme="green"] {
  --promo-primary: theme("colors.green.500");
  --promo-primary-dark: theme("colors.green.600");
  --promo-accent: theme("colors.green.400");
  --promo-text: theme("colors.green.600");
  --promo-text-dark: theme("colors.green.400");
}
```

## Dismissal Behavior

- Banner dismissal sets cookie `{PROMO_ID}-dismissed` for 30 days
- Cookie prevents banner from reappearing for that user
- Server action: `app/[lang]/actions/promos.ts`
- Client cookie utility: `lib/cookies.ts` (with fallback for older browsers)

## Checklist

1. Set `NEXT_PUBLIC_PROMO_ENABLED=true`
2. Set unique `NEXT_PUBLIC_PROMO_ID` (changes cookie name)
3. Set `NEXT_PUBLIC_PROMO_TRANSLATIONS` to match translation key
4. Add translations to all locale files
5. Optionally set countdown end date and theme
6. Deploy and verify banner appears on landing and dashboard
