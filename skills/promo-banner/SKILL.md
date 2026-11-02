---
name: promo-banner
description: Configure and verify promotional campaigns using the shared banner system. Use when enabling or reusing seasonal offers, setting bonus credits, selecting banner themes and placements, or testing promo pricing, countdowns, and dismissal across the homepage, dashboard, and blog.
---

# Promo banner setup

Configure a promotional banner through the shared banner registry. Existing
placements already resolve and render the highest-priority active banner.

## Inspect the campaign

Inspect `apps/web/lib/banners/registry.ts`, existing copy under `promos` in
`apps/web/messages/*.json`, relevant environment values, and
`apps/web/lib/stripe/pricing.ts` before editing. Reuse a registered banner when
its offer, placements, and dismissal behavior fit; add an entry only when needed.

Confirm the target environment (local, preview, or production), offer type,
package bonuses, and campaign end time. Inspect only relevant configuration;
do not print secrets. Do not deploy, modify Stripe resources, or make a payment
unless the user requests it.

For campaign copy, follow the positioning and claims guidance in
`.agents/product-marketing.md` as required by `AGENTS.md`.

## Configure the campaign

Set the active registry entry in `apps/web/.env.local` or the deployment
environment:

```bash
# Required
NEXT_PUBLIC_PROMO_ENABLED=true
NEXT_PUBLIC_ACTIVE_PROMO_BANNER=winterSaleBanner

# Optional presentation
NEXT_PUBLIC_PROMO_THEME=pink
# Only if the selected registry entry supports a countdown
# NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE=2027-01-31T23:59:59Z

# Only for Stripe metadata and bonus-credit campaigns
NEXT_PUBLIC_PROMO_ID=winter_sale_2027
NEXT_PUBLIC_PROMO_BONUS_STARTER=2000
NEXT_PUBLIC_PROMO_BONUS_STANDARD=7500
NEXT_PUBLIC_PROMO_BONUS_PRO=105000
```

Set `NEXT_PUBLIC_ACTIVE_PROMO_BANNER` explicitly to select a promo banner.
When it is unset or empty, no promo banner is selected.
`NEXT_PUBLIC_PROMO_ID` does not select the banner or name its dismissal
cookie.

## Offer behavior and expiry

| Control                           | Effect                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_PROMO_ENABLED`       | Enables promo banner selection, bonus-credit pricing, and promo metadata; does not control announcements.            |
| `NEXT_PUBLIC_ACTIVE_PROMO_BANNER` | Selects the banner, not the financial offer.                                                                         |
| `NEXT_PUBLIC_PROMO_BONUS_*`       | Adds credits without reducing the payment amount.                                                                    |
| Stripe first-month coupon         | Separately discounts eligible subscribers' checkout prices; see [Stripe configuration](../../docs/devops.md#stripe). |

Banner absence or dismissal does not disable bonus-credit pricing. The Stripe
coupon is independent of the promo flag; verify its validity and eligibility
when a campaign advertises a price discount. Do not treat the displayed discount
percentage as proof of the coupon's actual terms.

Check advertised percentages against package totals from
`apps/web/lib/stripe/pricing.ts`. Subscription credits are
`Math.round((baseCredits + promoBonus) * SUBSCRIPTION_BONUS_MULTIPLIER)`;
the multiplier is `1.15`. The displayed monthly bonus includes both the promo
and subscription bonuses. For example, a 25,000-credit package with 7,500 promo
credits yields 32,500 one-time credits or 37,375 monthly credits. Extra credits
are not a percentage reduction in price.

A countdown controls banner presentation, not offer eligibility. It requires a
registry `countdown` definition, localized countdown labels, and an end-date
environment value. Setting the environment value alone does not add a timer.
The server resolver excludes expired countdown banners when it runs; the client
also checks expiry when resolving visibility and while a displayed timer runs. Shared expiry
logic lives in `apps/web/lib/banners/countdown.ts`. This only ends banner display,
not the financial offer.

Confirm the shutdown procedure: disable the promo flag in the target environment
to stop promo bonuses and banner selection, and end any Stripe coupon offer
independently. Follow the deployment workflow for environment changes
in [deployment guidance](../../docs/devops.md). Do not promise automatic expiry
unless the billing path enforces it.

## Register the banner

For a new banner, add an entry to `apps/web/lib/banners/registry.ts`. The `id`
must match the active environment value and the translation key. Give each
banner a stable, unique dismissal cookie.

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

The landing, voice-cloning, and voice-call pages omit request cookies to keep
their static caching. On those pages, the client can hide a dismissed banner,
but it cannot replace it with the next eligible banner because the server sent
only the highest-priority banner. If a promo and announcement are active
together, dismissing the promo leaves the banner slot empty on those pages.
Expiry has the same limitation: the client hides a promo that expires after the
static page is built, but an announcement cannot replace it until the page is
regenerated, such as by a new deployment.
Blog and dashboard pages pass dismissal cookies to the resolver, so a subsequent
server render can select the next eligible announcement. Client-side dismissal
alone hides the current banner; it does not immediately resolve a replacement.

## Theme colors

Set `NEXT_PUBLIC_PROMO_THEME` to `pink`, `orange`, or `blue`. Theme variables
live in `apps/web/app/globals.css` under `[data-promo-theme]` selectors.

When adding a theme, extend `BannerTheme` in
`apps/web/lib/banners/types.ts`, add its CSS variables, and update the example
environment values.

Use promo color tokens for banner hover and keyboard-focus treatments, not
generic gray button states. In `apps/web/components/pricing-cards.tsx`, both
billing modes use one translated bonus label and the promo color while a promo
is enabled. Without a promo, monthly subscription bonuses stay green and
one-time bonuses are hidden. Keep this presentation consistent across locales.

## Background artwork

A registry entry can set `artwork` with a `desktop` and `mobile` image
(`src`, `width`, `height`). The mobile image applies below the `sm`
breakpoint. Only `halloweenBanner` sets it, using WebP files in
`apps/web/public/images/banners/`.

`BannerArtworkLayer` in `apps/web/components/banner.tsx` pins each half of the
image to its banner edge at full banner height and fills the middle with a
blurred copy. So the art must:

- keep all decorations near the left and right ends;
- leave the middle dark and nearly empty for white text and the CTA;
- use a wide desktop ratio (8:1) and a shorter mobile ratio (21:9).

Generate art with Gemini's `gemini-nano-banana-2.1` model, which supports 8:1
(`gemini-3-pro-image` rejects it). Prompt for no text or logos, then resize to
about 264px tall (desktop) and 480px tall (mobile) WebP and record the final
dimensions in the registry.

## Public banner layout

At desktop widths, public banners center the copy between equal side columns
and keep the CTA and dismiss control on the right. The copy uses half the
available grid width, so long translations and countdown banners can wrap onto
extra lines. This is the trade-off for keeping wrapped text centered regardless
of control width. Verify long copy and countdowns before changing the layout;
an auto-sized middle column can shift long copy off-center.

## Dashboard layout

Keep dashboard banners in normal flow inside the content column in
`apps/web/app/[lang]/(dashboard)/dashboard.ui.tsx`; do not cover the page heading
or desktop sidebar with a fixed banner.

On mobile, the dashboard-owned sidebar trigger overlays the visible banner at
the top-left; dismissal sits at the top-right. The content column uses CSS
`:has()` with the banner's `data-dashboard-banner` marker to detect actual
rendering. When the banner is absent, the standalone navigation header remains.
Do not use the promo flag or `activeBanner` prop alone to position navigation:
a dismissal cookie can hide a configured banner.

The banner and overlaid trigger intentionally scroll away together rather than
covering page content with a floating control. Users return to the top to open
the sidebar while a banner is visible. Without a banner, the standalone header
stays sticky.

Keep text centered with clearance around both controls, and align the first
mobile text line with the icons. Preserve navigation when the banner is
dismissed, disabled, or non-dismissible. Leave exact spacing in the components.

## Dismissal behavior

The registry entry owns the dismissal `cookieKey` and retention period in
`days`. `apps/web/components/banner.tsx` hides the banner immediately and
writes that cookie through `setCookie` in `apps/web/lib/cookies.ts`. The
resolver reads the same cookie on later requests.

Dismissal is entirely client-side. Do not add a Server Action or derive the
cookie name from `NEXT_PUBLIC_PROMO_ID`.

## Verification

Follow `AGENTS.md` for mandatory validation and its documentation-only exception.
For campaign or runtime changes, run translation parity checks and the focused
banner and pricing tests:

```sh
pnpm check-translations
pnpm --filter @sexyvoice/web test --run tests/banner-resolver.test.ts tests/components/banner.test.tsx tests/stripe-pricing.test.ts tests/components/pricing-cards.test.tsx
```

When checkout or fulfillment behavior changes, also run the relevant
`tests/stripe-actions.test.ts` and `tests/stripe-webhook.test.ts` suites.

Verify the following states before deployment:

- Mobile and desktop: each supported placement, wrapping in supported locales,
  text/icon alignment, control clearance, and themed hover and keyboard focus.
- Banner visible, dismissed, and disabled: sidebar navigation works in each
  dashboard state. Use a fresh browser context or clear the specific dismissal
  cookie to distinguish misconfiguration from a dismissed banner.
- Logged-in and logged-out CTAs: check the actual placement's audience and target;
  the cacheable homepage resolves the logged-out CTA.
- Monthly and one-time pricing, with promos enabled and disabled: compare credit
  totals, prices, translated bonus labels, and theme colors against the offer.
- Countdown-supported campaigns: check expiry without assuming bonus credits or
  a Stripe coupon have ended.
- Overlapping promo and announcement: check immediate dismissal and a subsequent
  server render on both cacheable and cookie-aware pages.

Capture screenshots from an authenticated dashboard and public pages at mobile
and desktop widths. If authentication blocks inspection, report it; do not claim
visual verification from component tests alone.

## Checklist

1. Inspect and reuse existing campaign definitions before adding entries.
2. Confirm the environment, offer, totals, deadline, and shutdown procedure.
3. Check CTA targets, placements, priority, and stable dismissal cookies.
4. Add or update campaign copy in all six locales when needed.
5. Set the promo flag and explicit banner id; configure theme, metadata, bonuses,
   and supported countdown settings for the intended offer.
6. Complete the applicable checks in Verification and `AGENTS.md`.
7. Report what was configured, tested, and visually verified, and what remains
   before production activation.
