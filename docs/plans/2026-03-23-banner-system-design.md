# Banner System Design

## Summary

Refactor the current promo-specific banner into a reusable banner system that
supports both promotional and announcement banners across the landing page,
dashboard, and blog.

The system should:

- keep all banner copy localized in `messages/*.json`
- support independent dismiss cookies per banner
- show exactly one visible banner at a time
- preserve the existing promo banner behavior when promos are enabled
- add support for a single active announcement banner configured separately

## Goals

1. Replace promo-specific rendering with a generic banner component
2. Centralize banner definitions in a small typed registry
3. Resolve the single visible banner by placement and priority
4. Support localized promo and announcement copy
5. Keep activation operationally simple through environment variables

## Non-goals

1. Do not introduce a CMS for banner management
2. Do not support multiple visible banners stacked together
3. Do not move banner copy out of `messages/*.json`
4. Do not change pricing promo logic beyond banner display concerns

## Current Problems

The current `PromoBanner` component is tightly coupled to the promo system:

- dismiss cookies are derived from `NEXT_PUBLIC_PROMO_ID`
- dismissal always calls a promo-specific server action
- promo lookup logic is duplicated in landing, blog, and dashboard pages
- the component cannot cleanly represent non-promo announcements

This makes it hard to add a localized announcement banner without either
misusing promo semantics or increasing duplication.

## Proposed Architecture

### 1. Generic banner component

Create a reusable rendering component responsible only for UI behavior:

- visibility state
- countdown display
- dismiss interaction
- CTA rendering
- dashboard vs public page layout treatment

The component should not read promo env vars or construct promo-specific cookie
names on its own.

### 2. Typed banner registry

Add a small registry in `lib/banners/registry.ts` that defines the banners known
to the app.

Each banner definition should include:

- `id`
- `kind`: `promo` or `announcement`
- `placements`: `landing`, `dashboard`, `blog`
- `priority`
- `theme`
- `dismiss`: cookie key and cookie duration
- `translationKey`
- CTA behavior for logged-in vs logged-out users
- optional countdown configuration

This registry is intentionally small and code-based. It is the source of truth
for banner behavior, not for localized copy.

### 3. Resolver layer

Add a resolver in `lib/banners/resolve-banner.ts` that:

1. reads active banner ids from env
2. looks them up in the registry
3. filters by placement
4. resolves localized content from `messages`
5. applies priority
6. returns exactly one normalized banner payload or `null`

This removes duplicated banner selection logic from the page layer.

### 4. Generic dismissal action

Replace the promo-specific server action with a generic banner dismissal action.

For safety, the action should accept a banner id, not an arbitrary cookie key.
The server maps the id to the cookie metadata from the registry and writes the
corresponding cookie.

## Activation Model

Use a hybrid activation model:

- banner behavior is defined in code
- banner copy stays in translations
- env vars select which banner is active

Expected env vars:

- `NEXT_PUBLIC_PROMO_ENABLED`
- `NEXT_PUBLIC_ACTIVE_PROMO_BANNER`
- `NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER`
- existing promo countdown env can remain for promo banners that need it

Only one announcement is expected to be active at a time.

## Localization Model

Banner copy must remain fully localized.

Recommended message structure:

- `messages.promos.<bannerId>`
- `messages.announcements.<bannerId>`

Each localized banner entry should include:

- `text`
- `ctaLoggedOut`
- `ctaLoggedIn`
- `ariaLabelDismiss`
- optional `countdown`

The registry points to translation keys rather than storing raw user-facing
copy.

## Visibility Rules

Exactly one banner may be visible at a time.

Resolution rules:

1. collect active candidate banners
2. filter by placement
3. filter out invalid or untranslated entries
4. sort by priority
5. render the highest-priority banner only

Dismissal remains independent because each banner writes its own cookie.

## CTA Rules

The resolved banner payload should already contain the correct CTA for the
current audience:

- public pages normally use logged-out CTA targets
- dashboard uses logged-in CTA targets

This keeps the render component simple and makes CRO decisions explicit in the
registry and translations.

## Migration Strategy

1. Introduce the new generic banner system alongside the current promo behavior
2. Add a promo registry entry mirroring the existing banner setup
3. Replace landing, dashboard, and blog banner wiring with the resolver
4. Remove promo-specific logic from the UI component
5. Add the first announcement banner entry and localization keys

## Testing Strategy

Add or update tests for:

- registry and resolver behavior
- promo vs announcement priority
- placement filtering
- dismissal by banner id
- countdown rendering
- public vs dashboard CTA selection
- regression coverage for current promo behavior

## Risks

- translation typing may become awkward if promo and announcement shapes diverge
- env naming drift can create silent no-banner states
- banner id changes must also update dismissal cookie strategy carefully

## Recommendation

Implement a generic banner component, a typed registry, and a resolver-based
selection flow. This provides the lowest long-term coupling while preserving the
current promo behavior and enabling localized announcement banners cleanly.
