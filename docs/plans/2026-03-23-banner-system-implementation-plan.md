# Banner System Implementation Plan

## Objective

Implement the approved reusable banner system so the app can support both promo
and announcement banners with:

- localized copy
- independent dismiss cookies
- one visible banner at a time
- shared support for landing, dashboard, and blog

## Phase 1: Introduce the shared banner model

1. Add banner types in `lib/banners/types.ts`
2. Add a typed banner registry in `lib/banners/registry.ts`
3. Add resolver helpers in `lib/banners/resolve-banner.ts`
4. Preserve current promo activation through the new resolver

Deliverable:

- the app can resolve a promo banner without using `PromoBanner`-specific env
  logic in pages

## Phase 2: Generalize dismissal and rendering

1. Add a generic banner dismissal server action
2. Create a generic rendering component, likely `components/banner.tsx`
3. Move countdown and dismiss UI behavior into the generic component
4. Remove promo-only assumptions from the render layer

Deliverable:

- banner rendering works from normalized resolved data

## Phase 3: Replace current page integrations

1. Update landing page banner usage
2. Update dashboard layout and dashboard UI banner usage
3. Update blog page banner usage
4. Remove duplicated promo lookup logic from those call sites

Deliverable:

- landing, dashboard, and blog all use the same resolution path

## Phase 4: Add announcement support

1. Add announcement translation namespace to all locales
2. Add one initial announcement banner entry in the registry
3. Add env-driven activation for a single announcement banner
4. Enforce priority so only one banner renders

Deliverable:

- an announcement banner can be enabled without affecting promo dismissal state

## Phase 5: Cleanup and compatibility

1. Remove or replace `components/promo-banner.tsx`
2. Remove `app/[lang]/actions/promos.ts` if no longer needed
3. Keep promo-related pricing translations untouched unless required
4. Update any derived typing that referenced `PromoBanner`

Deliverable:

- the codebase no longer depends on promo-specific banner infrastructure

## Verification

### Targeted tests

- resolver returns promo when only promo is active
- resolver returns announcement when only announcement is active
- resolver returns highest priority banner when both are active
- resolver ignores banners not valid for the current placement
- dismiss action writes the expected banner cookie
- generic component hides dismissed banner

### Regression checks

- promo banner still renders on landing when enabled
- promo banner still renders on dashboard with logged-in CTA
- promo banner still supports countdown when configured
- announcement banner renders localized copy when activated

### Commands

- `pnpm test -- --run <targeted test files>`
- `pnpm type-check`
- `pnpm run fixall`

## Expected Files

- `components/banner.tsx`
- `lib/banners/types.ts`
- `lib/banners/registry.ts`
- `lib/banners/resolve-banner.ts`
- `app/[lang]/actions/banners.ts`
- updated page integrations under `app/[lang]/`
- updated locale files under `messages/`

## Rollout Notes

- keep promo ids stable during migration to avoid surprising dismiss-cookie
  resets unless an intentional reset is desired
- version announcement dismiss keys when the message meaning changes materially
- document the new env vars after implementation
