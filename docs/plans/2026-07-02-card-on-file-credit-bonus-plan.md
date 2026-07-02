# Card-on-file credit bonus — implementation plan

**Date:** 2026-07-02
**Status:** Reviewed 2026-07-02 (codebase claims verified; review fixes
incorporated) — awaiting implementation

## Goal

Change the new-user credit model so that adding a payment method is the
incentive to unlock the bulk of the free allowance:

- First-time users get **1,000** credits on signup (down from the current
  10,000).
- If the user **adds a credit card** (no charge), they get a **one-time
  9,000** credit bonus, bringing them to 10,000 total.

The bonus must be granted **exactly once per user** and be resistant to
farming (one physical card = one bonus, globally).

## Decisions (locked)

1. **Initial grant → 1,000.** The freemium signup grant drops from 10,000 to
   1,000. Existing users are unaffected (trigger only runs on new signups).
2. **Anti-abuse: setup mode + card-fingerprint dedupe + standard Radar.**
   - No charge to the user (Stripe `mode: 'setup'` Checkout Session).
   - Global dedupe on the Stripe **card fingerprint** so one physical card can
     only ever unlock the bonus once, across all accounts.
   - Standard (free) Radar left on for baseline fraud screening.
   - **Optional phase 2 hardening** (not in initial scope): (a) closing the
     Apple Pay / Google Pay wallet-fingerprint loophole, and (b) a small
     refundable charge (~$0.50) to prove the card is funded, defeating empty
     prepaid/virtual burner cards. Both documented below but deferred.

## Why setup mode + fingerprint (background)

- `mode: 'setup'` collects and saves a reusable `PaymentMethod` on the Stripe
  Customer without moving money. Stripe still runs a $0/authorization check.
- Stripe's **card fingerprint** (`payment_method.card.fingerprint`) is stable
  for the same physical card **across different Customers/accounts**. Deduping
  on it means a farmer needs a distinct real card per bonus — the strongest
  cheap defense against multi-account farming.
- ⚠️ **Known gap (accepted for v1, revisit in phase 2):** Apple Pay / Google
  Pay present network-tokenized PANs, which produce **different** fingerprints
  than the same card typed in manually — and hosted Checkout shows wallets by
  default when `card` is enabled, with no reliable way to disable them. One
  physical card could plausibly claim the bonus 2–3× (manual entry + each
  wallet). Fingerprinting still blocks the cheap attack (re-entering the same
  card across accounts); the wallet loophole is bounded and handled in phase 2.
- Radar's ML targets _stolen/fraudulent_ cards, not _legitimate cards used for
  promo abuse_, so it is defense-in-depth here, not the primary control.

## Current architecture (as-is)

- **Balance:** `credits.amount` (one row per user), incremented via RPC
  `increment_user_credits(user_id_var, credit_amount_var)` (UPSERT add,
  `SECURITY DEFINER`).
- **Ledger:** `credit_transactions` (type enum:
  `purchase | freemium | topup | refund`), deduped on `reference_id` (Stripe
  id) via a pre-check plus a `23505` unique-violation guard
  (`isCreditTransactionReferenceConflict`, `lib/supabase/queries.ts:577`).
- **Signup grant — TWO triggers fire on `auth.users` insert:**
  - `new_user_trigger` (`20250131110033_remote_schema.sql`) →
    `handle_new_user()` (latest def:
    `20250433161918_add_initial_credits.sql`). Inserts the profile, a 10,000
    `freemium` **ledger** row, **and** the 10,000 `credits` **balance** row.
    **This is the authoritative source of the spendable balance.**
  - `add_credits_trigger` (`20250324100000_add_credits_trigger.sql`) →
    `add_credits_on_event()`. Inserts **only** a second 10,000 `freemium`
    **ledger** row — it never writes the `credits` balance table.
  - ⚠️ Consequence: the ledger already double-counts the freemium grant
    (20,000 in `credit_transactions` vs. 10,000 actual balance). Lowering the
    grant only via `handle_new_user()` while keeping `add_credits_trigger`
    would produce a **1,000 balance but an 11,000 ledger** for new users, and
    would break the freemium-amount signal used for CTA eligibility. The
    redundant trigger must be dropped (decision below).
- **Stripe:** Customer per user (`profiles.stripe_id`), created in
  `app/auth/callback/route.ts`. Checkout via `createCheckoutSession()`
  (`app/[lang]/actions/stripe.ts`) supporting `payment` (topup) and
  `subscription`. Webhook `app/api/stripe/webhook/route.ts`. **No SetupIntent /
  saved reusable payment method / off-session charging exists today.**

## Target flow

1. User visits `/dashboard/credits`, sees a "Add a card, get 9,000 credits"
   CTA (hidden once already claimed).
2. Server action `createCardBonusSetupSession({ lang })`:
   - Auth + resolve `stripe_id`.
   - Guard: if the user already has a `card_bonus` transaction, short-circuit
     (return an "already claimed" signal; do not create a session).
   - Create a Checkout Session:
     ```ts
     stripe.checkout.sessions.create({
       mode: "setup",
       customer: stripeId,
       payment_method_types: ["card"],
       // Set metadata in BOTH places: `setup_intent_data.metadata` lands only
       // on the SetupIntent and is NOT mirrored onto the session, so the
       // session needs its own top-level `metadata` for the webhook branch.
       metadata: { userId, type: "card_bonus" },
       setup_intent_data: { metadata: { userId, type: "card_bonus" } },
       success_url: `${SITE}/${lang}/dashboard/credits?card_bonus=success`,
       cancel_url: `${SITE}/${lang}/dashboard/credits?card_bonus=canceled`,
       ui_mode: "hosted", // match existing hosted/embedded handling
     });
     ```
3. Stripe collects the card and attaches the `PaymentMethod` to the Customer.
4. Webhook `checkout.session.completed` with `session.mode === 'setup'` and
   `session.metadata?.type === 'card_bonus'`. ⚠️ `setup_intent_data.metadata`
   is **not** mirrored onto the session — the session-level check only works
   because the action sets top-level `metadata` too (above). Still verify
   `metadata.type === 'card_bonus'` on the retrieved SetupIntent as the
   authoritative signal:
   - Retrieve the SetupIntent, expanding `payment_method`, to obtain the
     `PaymentMethod` id and `card.fingerprint`.
   - Optionally set it as the Customer's default payment method
     (`invoice_settings.default_payment_method`) for future use.
   - Call `insertCardBonusCreditTransaction(userId, setupIntentId, fingerprint,
9000)`.
5. Grant is idempotent and fingerprint-guarded (below).

Add `setup_intent.succeeded` as a backup handler that routes to the same grant
function, in case the `checkout.session.completed` event is missed.

## Idempotency & abuse guards (three layers)

1. **Per-event:** dedupe on `reference_id = setup_intent_id`. ⚠️ Note the
   existing unique reference indexes are partial and only cover
   `purchase`/`topup` (`unique_reference_topup_idx` /
   `unique_reference_purchase_idx`), so a `card_bonus` `reference_id` gets no
   DB-level uniqueness from them. This layer is a pre-check only; the DB-level
   guarantee comes from layer 2 (which subsumes it — one `card_bonus` row per
   user, period).
2. **Per-user:** at most one `card_bonus` transaction per `user_id`
   (pre-check + partial unique index).
3. **Per-card (global):** a new table keyed by card fingerprint so a physical
   card can only unlock the bonus once across all accounts.

```sql
-- New table: global one-bonus-per-card enforcement
CREATE TABLE public.card_bonus_claims (
  fingerprint text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  setup_intent_id text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.card_bonus_claims ENABLE ROW LEVEL SECURITY;
-- No public policies: service-role only (writes happen in the webhook via
-- createAdminClient()). Users never read this directly.
```

The grant function inserts into `card_bonus_claims` first; a unique-violation
on `fingerprint` means the card already claimed → skip the credit grant
(and do not error the webhook).

## Implementation steps

### 1. Migrations (`apps/web/supabase/migrations/`)

Use `YYYYMMDDHHmmss_description.sql` naming. Provide these as migrations
(schema changes are appropriate here; the balance change to _existing_ users is
not a backfill — only the trigger definition changes going forward).

- **`..._lower_initial_credits_to_1000.sql`**
  - `CREATE OR REPLACE FUNCTION public.handle_new_user()` identical to
    `20250433161918_add_initial_credits.sql` but with both `10000` → `1000`.
    This is what actually sets the new user's spendable balance and freemium
    ledger row.
  - **Drop the redundant second trigger** so the ledger stops double-counting
    and each new user has exactly one `freemium` row of `1000` (required for
    the CTA eligibility check):
    `DROP TRIGGER IF EXISTS add_credits_trigger ON auth.users;`
    `DROP FUNCTION IF EXISTS public.add_credits_on_event();`
    Dropping this does **not** remove the initial credits — those come from
    `handle_new_user()` / `new_user_trigger`, which stays.
    (Verify in a read-only `supabase` check first; do not run writes via CLI.)
  - Keep `SECURITY DEFINER`, `SET search_path = ''`, fully-qualified names.

- **`..._add_card_bonus_transaction_type.sql`** — enum value **only**.
  - Add the enum value using the existing guarded `DO $$ ... ALTER TYPE
credit_transaction_type ADD VALUE 'card_bonus' ... $$;` pattern (see
    `20250401150000_add_topup_transaction_type.sql`).
  - Nothing else in this file. Postgres refuses to _use_ an enum value in the
    same transaction that added it, and each migration file runs in one
    transaction — so the partial index below (whose `WHERE` clause uses the
    value) **must** live in a later migration. This split is required, not a
    contingency.

- **`..._add_card_bonus_unique_index.sql`** — per-user enforcement, in its own
  later-timestamped migration:

  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_one_card_bonus_per_user
    ON public.credit_transactions (user_id)
    WHERE type = 'card_bonus';
  ```

- **`..._create_card_bonus_claims.sql`** — the `card_bonus_claims` table above.

After the migrations are applied, regenerate the Supabase types:
`pnpm --filter @sexyvoice/web generate-supabase-types` (updates
`lib/supabase/types.d.ts`, where `credit_transaction_type` is a pinned union —
`type: 'card_bonus'` will not type-check until this runs).

### 2. Queries (`apps/web/lib/supabase/queries.ts`)

Add `insertCardBonusCreditTransaction(userId, setupIntentId, fingerprint,
creditAmount = 9000)` modeled on `insertTopupCreditTransaction`:

- Use `createAdminClient()`.
- Insert into `card_bonus_claims` first; on `23505` (fingerprint conflict) log
  and return without granting.
- Pre-check existing `card_bonus` transaction for the user; skip if present.
- Insert `credit_transactions` row: `type: 'card_bonus'`,
  `reference_id: setupIntentId`, `description: 'Card-on-file bonus'`,
  `metadata: { fingerprint }`.
- ⚠️ Do **not** rely on `isCreditTransactionReferenceConflict` for this
  insert: it matches `/unique_reference|reference_id/i`, and the conflict here
  comes from the per-user index `credit_transactions_one_card_bonus_per_user`,
  whose name matches neither — the error would be rethrown. Instead treat
  **any** `23505` on this specific insert as "already claimed" (log + return
  without granting); every unique constraint that can fire here means exactly
  that.
- Call `updateUserCredits(userId, creditAmount)`.
- Add a helper `isEligibleForCardBonus(userId): Promise<boolean>` for both the
  CTA/banner and the server-action guard (see step 5 for the full eligibility
  rules).

Consider extracting the shared insert/dedupe skeleton (topup, subscription, and
now card-bonus all repeat it) into a small helper to honor the repo's
"avoid duplicate logic" rule — but keep the refactor scoped.

### 3. Server action (`apps/web/app/[lang]/actions/stripe.ts`)

Add `createCardBonusSetupSession({ lang })`:

- Reuse `getCheckoutStripeId()` for auth + `stripe_id`.
- Guard with `isEligibleForCardBonus(user.id)` → if not eligible, return an
  `{ alreadyClaimed: true }` shape (no session). This is the server-side
  enforcement boundary — hiding the CTA client-side is not sufficient.
- Respect `isE2E()` (return null client_secret/url like the existing action).
- Create the `mode: 'setup'` session shown above.
- Sentry error handling consistent with `createCheckoutSession`.

### 4. Webhook (`apps/web/app/api/stripe/webhook/route.ts`)

- Extend `handleCheckoutSessionCompleted` with a branch for
  `session.mode === 'setup'`:
  - Read `session.setup_intent` (id), retrieve with
    `expand: ['payment_method']`, confirm `metadata.type === 'card_bonus'`.
  - Extract `paymentMethod.card.fingerprint` and the payment method id.
  - Resolve `userId` from `setup_intent.metadata.userId` (or
    `getUserIdByStripeCustomerId(session.customer)`).
  - Optionally set the Customer default payment method.
  - Call `insertCardBonusCreditTransaction(...)`.
- Add `case 'setup_intent.succeeded':` as a backup that performs the same
  lookup + grant (idempotent, so double-firing is safe).
- Add `'setup_intent.succeeded'` (and, if used, `'setup_intent.setup_failed'`)
  to the `allowedEvents` array.
- **Also configure the new event in the Stripe Dashboard webhook endpoint** —
  `checkout.session.completed` is already enabled; add
  `setup_intent.succeeded`.

### 5. UI (`apps/web/app/[lang]/(dashboard)/dashboard/credits/`)

- Add an inline "Add a card, get 9,000 credits" card/CTA to the credits
  dashboard page (`page.tsx`). (Optional: also surface a dismissible
  dashboard-wide banner via `lib/banners/registry.ts` — deferred unless
  requested.)
- **Eligibility — show the CTA only when ALL are true** (new helper
  `isEligibleForCardBonus(userId)` in `lib/supabase/queries.ts`, ideally one
  query over `credit_transactions`):
  1. **Not yet claimed:** no `card_bonus` transaction.
  2. **Non-paid:** no `purchase` or `topup` transaction (reuse `hasUserPaid`).
  3. **New-regime user:** received the 1,000 grant, not the legacy 10,000.
     Detect via the user's `freemium` transaction `amount = 1000` — this is
     the **decided primary (and only) signal** (resolved decision 4). It is
     unambiguous because the redundant `add_credits_trigger` is dropped in the
     same migration that lowers the grant (single freemium row per user; old
     users only have 10,000 rows). No `created_at` fallback needed.
- On success return (`?card_bonus=success`), show a success toast (mirror the
  existing `?success=true` topup handling).
- Wire the CTA to `createCardBonusSetupSession({ lang })` and redirect to the returned
  hosted `url` (or use embedded checkout consistent with the current pattern).
- If `createCardBonusSetupSession({ lang })` returns `{ alreadyClaimed: true }`, hide
  the CTA / show claimed state (defensive — the eligibility check should
  already prevent this).
- **Render the new type as a credit, not a debit:** `credit-history.tsx:64`
  hardcodes the positive-amount types as
  `['purchase', 'freemium', 'topup'].includes(transaction.type)` — add
  `'card_bonus'` or the granted 9,000 renders styled like a refund/negative
  entry. Add a localized type label alongside the existing ones.
- **Daily stats:** `app/api/daily-stats/queries.ts` pins the transaction type
  union (`'purchase' | 'freemium' | 'topup' | 'refund'`) — extend it with
  `'card_bonus'` and decide how the stats classify it (grant, not revenue).

### 5b. Permanent, top-priority dashboard banner

In addition to the inline CTA, show a persistent banner across the dashboard
driving eligible users to claim. It must always win over other banners and be
non-dismissible while the user is eligible.

**Eligibility = identical to the inline CTA** (`isEligibleForCardBonus`):
non-paid AND not-yet-claimed AND new-regime (freemium `amount = 1000`). Banner
and CTA share the same check so users are never shown a banner for a bonus they
can't claim. (Interpreting the "didn't add a card OR old user without 10k" note
as this single eligible population — confirm if a broader audience is intended.)

**How the current banner system constrains this:**

- `resolveActiveBanner` (`lib/banners/resolve-banner.ts`) already returns only
  the single highest-`priority` banner, so a higher priority automatically
  hides the others ("only one banner visible").
- `BannerDefinition.dismissible?: boolean` already exists (defaults true via
  `dismissible ?? true` in `resolveBanner`). Set `false` for "permanent."
- ⚠️ The resolver only considers **env-var-selected** promo/announcement IDs
  (`getActivePromoBannerId` / `getActiveAnnouncementBannerId`). It has **no
  per-user/DB awareness**, so a DB-gated banner needs a small extension.

**Changes:**

1. **Registry** (`lib/banners/registry.ts`): add `cardBonusBanner`:
   - `kind: 'announcement'`, `placements: ['dashboard']` (dashboard-only —
     eligibility needs an authenticated DB lookup; landing/blog logged-out
     users are out of scope).
   - `priority: 1000` (above the promo/announcement 90–100 so it always wins).
   - `dismissible: false`.
   - `cta.loggedInHref: creditsHref` (link to the credits page where the inline
     "add card" action lives — keeps the banner a simple link like the others).
   - `dismiss.cookieKey`: a placeholder (required by the type; never set since
     non-dismissible).
2. **Resolver** (`lib/banners/resolve-banner.ts`): add an optional input to
   `ResolveActiveBannerOptions`, e.g. `conditionalBannerIds?: string[]`
   (or a boolean `cardBonusEligible`). Include `cardBonusBanner` in the
   candidate `activeBannerIds` **only when eligible**. Everything else
   (priority sort, single-winner return, dismissal filtering) stays as-is.
3. **Dashboard layout** (`app/[lang]/(dashboard)/layout.tsx`): it already loads
   `creditTransactions` and `isPaidUser`. Compute `cardBonusEligible` from
   those (no new query): not paid, no `card_bonus` row, and a `freemium` row
   with `amount === 1000`. Pass it into `resolveActiveBanner`. In `isE2E()`,
   default to `false` (mirrors the hardcoded `isPaidUser = false`).
   Two mechanical prerequisites: `resolveActiveBanner` is currently called
   _before_ the transactions fetch (line ~43 vs ~51) — reorder so eligibility
   is available; and `dashboard.ui.tsx` types the prop as
   `Pick<Tables<'credit_transactions'>, 'amount'>[]` — widen to include
   `type` where the eligibility fields are consumed.
4. **Rendering** (`dashboard.ui`): the existing banner component must honor
   `dismissible: false` by not rendering the dismiss button. Verify current
   markup; add the conditional if missing.

No new env var is required — this banner is DB-gated, intentionally bypassing
the env promo/announcement gating.

### 6. i18n

- Add keys for the CTA, success, "already claimed", and error copy in **all**
  `apps/web/messages/*.json` (`en, es, de, da, it, fr`) — no hardcoded English.
- Add the banner copy under `announcements.cardBonusBanner` in every locale
  (`text`, `ctaLoggedIn`, `ctaLoggedOut`, `ariaLabelDismiss`) — shape per
  `BannerTranslation`. `getBannerTranslation` reads announcement banners from
  `messages.announcements[id]`.
- **Update the existing "10,000 free credits" marketing copy — it becomes
  false the moment the grant drops to 1,000.** In `messages/en.json` alone:
  the hero `freeCredits` ("Start with 10,000 free credits", ~L115), the FAQ
  answer ("New users get 10,000 free credits...", ~L218), and the signup SEO
  copy (`descriptionSignup` "get 10,000 credits instantly" ~L767 and
  `"/signup": "Sign Up Free – 10,000 Credits"` ~L777). Sweep **all six
  locales** for the equivalents (search for `10,000` / `10.000` / `10000`).
  New copy should reflect the split, e.g. "1,000 free credits — add a card to
  unlock 10,000". This is a legal/product accuracy requirement, not polish.
- Run `pnpm check-translations`.

### 7. Docs

- Update `docs/devops.md` if any new env var is introduced (none required for
  the base plan; the optional refundable-charge phase would add an amount/coupon
  env var).
- Note the new webhook event in the Stripe/webhook section.
- If the external API or pricing docs mention the freemium grant amount, update
  the 10,000 → 1,000 reference and describe the card bonus.
- `Changelog.md` per `docs/changelog-format.md` at release time.

## Edge cases & notes

- **Removing the card after claiming:** the bonus is already granted and
  fingerprint-recorded; re-adding the same card won't grant again. Acceptable.
- **User already has a subscription/saved card:** they can still claim once
  (subject to fingerprint/per-user guards). Decide whether existing payers
  should see the CTA at all — recommend hiding it for users who already paid
  (`hasUserPaid`).
- **Card fingerprint missing:** non-card methods won't have one; we restrict to
  `payment_method_types: ['card']`, so this shouldn't occur. Guard defensively
  and skip the grant (log to Sentry) if fingerprint is absent.
- **Existing users (pre-change):** already hold 10,000; unaffected. Only new
  signups get 1,000. If you want existing not-yet-carded users to also be able
  to claim the 9,000, that's a separate backfill decision — flag before build.
- **Double-trigger cleanup:** confirm no other code depends on the
  `add_credits_trigger` before dropping it (search shows it only writes a
  duplicate ledger row).

## Optional phase 2 — hardening (deferred)

Two known farming vectors to revisit if abuse shows up in the data:

### 2a. Wallet fingerprint bypass (Apple Pay / Google Pay)

Network-tokenized wallet cards fingerprint differently from the same physical
card entered manually (see the known-gap note in the fingerprint section), so
one card can claim up to ~3 bonuses via manual entry + each wallet. Options:

- Inspect `payment_method.card.wallet` on the SetupIntent's payment method and
  exclude wallet-tokenized cards from the bonus (show "please enter your card
  directly" messaging), or
- Combine with the refundable charge below (an empty burner behind a wallet
  fails the charge), or
- Accept and monitor: `card_bonus_claims` rows sharing `user_id` patterns or
  Radar signals surface abuse cheaply.

### 2b. Refundable charge

If prepaid/virtual burner cards farm the bonus despite fingerprinting:

- Replace `mode: 'setup'` with a `mode: 'payment'` PaymentIntent for a small
  amount (e.g. $0.50) with `capture_method: 'automatic'` and `setup_future_
usage: 'off_session'`, then **refund** it in the webhook after grant.
- Pros: proves funds; blocks empty prepaid cards. Cons: statement noise, Stripe
  fee on tiny amounts, more failure branches (partial refund, failed refund).
- Would add an amount env var and refund handling; document in `docs/devops.md`.

## Testing

- **Vitest** (`apps/web/tests/`): unit-test `insertCardBonusCreditTransaction`
  dedupe paths (fresh grant, duplicate setup_intent, duplicate user, duplicate
  fingerprint). Mock the admin client like existing credit tests.
- **Webhook:** simulate `checkout.session.completed` (setup mode) and
  `setup_intent.succeeded` fixtures; assert single grant, idempotency.
- **Stripe CLI:** `stripe listen` + `stripe trigger setup_intent.succeeded` for
  a local end-to-end check.
- **E2E:** setup-mode redirect goes to Stripe-hosted UI; keep behind `isE2E()`
  short-circuit (see memory note on E2E SSR data mocking) rather than driving
  Stripe's hosted page.
- Run `pnpm fixall`, `pnpm type-check`, `pnpm test`, `pnpm check-translations`.

## Resolved decisions

1. **CTA + banner visibility:** shown only to non-paid, not-yet-claimed,
   **new-regime** (1,000-grant) users. See eligibility rules in step 5. The
   permanent dashboard banner (step 5b) uses the **same** eligibility and, via
   `priority: 1000` + `dismissible: false`, always shows on top and suppresses
   other banners while the user is eligible.
2. **Existing pre-change users:** **not** eligible — bonus is new-signups-only
   (users who received the 1,000 grant). Enforced by the `freemium amount =
1000` eligibility check plus the per-user and per-card guards.
3. **`add_credits_trigger`:** **dropped.** It only writes a duplicate freemium
   ledger row; the spendable balance comes from `handle_new_user()`
   (`new_user_trigger`), which stays. Dropping keeps the ledger clean so the
   eligibility check is reliable.
4. **New-regime eligibility signal:** **`freemium amount = 1000`** is the
   primary (and only) signal. It is self-contained in the ledger and
   unambiguous once `add_credits_trigger` is dropped in the same migration:
   old users have freemium row(s) of 10,000, new users exactly one row of
   1,000. No `created_at` check is needed — the trigger change and the
   eligibility logic ship together, so no user can have a 1,000 freemium row
   without being new-regime.

No open questions remain — the plan is ready to implement.
