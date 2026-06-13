# NowPayments Integration Plan

Status: Approved (decisions locked-in 2026-05-13)
Branch: `claude/add-nowpayments-integration-HyvHg`
API reference: https://documenter.getpostman.com/view/7907941/2s93JusNJt

## Goal

Add NowPayments (crypto) as a second payment provider alongside the existing
Stripe integration, supporting one-time credit top-ups in v1 and crypto
subscriptions in v2.

## Context recap

What we parallel:

- **Monorepo:** Next.js 15 app at `apps/web` (app router, Node 24, pnpm).
- **Pricing config:** `apps/web/lib/stripe/pricing.ts` — 3 tiers ($5/$10/$75) for
  both top-up and subscription; subscription adds a 15% credit bonus.
- **Stripe server action:** `apps/web/app/[lang]/actions/stripe.ts` → creates
  Checkout Session.
- **Stripe webhook:** `apps/web/app/api/stripe/webhook/route.ts` → on
  `checkout.session.completed` / `invoice.payment_succeeded`, awards credits
  via `insertTopupCreditTransaction` / `insertSubscriptionCreditTransaction`.
- **DB:** `credit_transactions` (enum `purchase|usage|freemium|topup|refund`,
  plus `reference_id`, `subscription_id`, `metadata JSONB`); `profiles.stripe_id`
  links the Supabase user to a Stripe customer.
- **Idempotency key:** `reference_id` (Stripe `payment_intent`).
- **UI:** `apps/web/app/[lang]/(dashboard)/dashboard/credits/credit-topup.tsx`
  calls the server action.

## How NowPayments differs from Stripe (important constraints)

1. **No card-on-file.** Crypto can't auto-charge. NowPayments "subscriptions"
   are really *recurring email-invoices*: each cycle they email the customer a
   payment link. The customer must click & pay every period. Worth telling
   users explicitly.
2. **Hosted invoice ≈ Stripe Checkout.** `POST /v1/invoice` → returns
   `invoice_url`; we redirect.
3. **IPN webhook** is HMAC-SHA512 over the *sorted JSON body* using the IPN
   secret, header `x-nowpayments-sig`. Must verify before trusting.
4. **Status state-machine:**
   `waiting → confirming → confirmed → sending → finished`, plus
   `partially_paid`, `failed`, `refunded`, `expired`. Credits are only granted
   on `finished` (and possibly `partially_paid` if amount ≥ expected).
5. **Idempotency:** the same `payment_id`/`invoice_id` will receive multiple
   IPN calls as it transitions — must dedupe by `(provider, reference_id)`.
6. **Subscriptions need JWT.** `/v1/subscriptions/*` endpoints require Bearer
   auth from `/v1/auth` (email/password), not just the API key. We'll cache
   the JWT. (v2 scope.)

## Locked-in decisions

| Decision | Choice |
| --- | --- |
| Coexistence in `credit_transactions` | Add a `provider` column (`'stripe' \| 'nowpayments'`) |
| v1 scope | Top-ups only; crypto subscriptions deferred to v2 |
| UI placement | Tabs *Card (Stripe)* / *Crypto (NowPayments)* on `/dashboard/credits` |
| Accepted coins | Curated list: BTC, ETH, USDT, USDC, SOL, LTC |

## Architecture (v1)

### 1. DB migrations (`apps/web/supabase/migrations/`)

**`<timestamp>_add_provider_to_credit_transactions.sql`**

- Add `provider TEXT NOT NULL DEFAULT 'stripe'` to `credit_transactions` with
  `CHECK (provider IN ('stripe','nowpayments'))`.
- Drop existing `credit_transactions_reference_id_idx`.
- Add composite uniqueness:
  `UNIQUE (provider, reference_id) WHERE reference_id IS NOT NULL`.
- Backfill not needed (default takes care of existing rows).

### 2. Pricing config

Reuse `apps/web/lib/stripe/pricing.ts` as-is. NowPayments invoices take a USD
amount directly — no price IDs needed for top-ups. If we later add crypto
subscriptions (v2), we'll create matching NowPayments plans and store their
IDs as env vars.

### 3. New files

```
apps/web/lib/nowpayments/
  client.ts                    # fetch wrapper, base URL toggle (sandbox)
  invoice.ts                   # createInvoice({ priceAmountUsd, orderId, ... })
  ipn.ts                       # verifySignature(rawBody, sigHeader) — HMAC-SHA512 sorted-keys
  types.ts                     # IPN payload + invoice response types

apps/web/app/[lang]/actions/nowpayments.ts
  createCryptoTopupCheckout(formData, packageId)
    → returns { url }  (the NowPayments invoice_url)

apps/web/app/api/nowpayments/webhook/route.ts
  POST handler: verify sig → switch on payment_status → award credits
  (mirrors stripe/webhook/route.ts structure)

apps/web/app/[lang]/(dashboard)/dashboard/credits/crypto-topup.tsx
  Mirrors credit-topup.tsx but calls createCryptoTopupCheckout
```

### 4. Top-up flow

1. User clicks **Pay with crypto** on the Crypto tab of `/dashboard/credits`.
2. Server action:
   - Authenticate user via Supabase.
   - Look up the selected package from `getTopupPackages('en')`.
   - Generate `order_id = "topup_${userId}_${nanoid()}"`.
   - Insert a *pending* row in `credit_transactions`:
     `{ provider: 'nowpayments', reference_id: orderId, amount: 0,
        type: 'topup', metadata: { status: 'pending', packageId, credits,
        dollarAmount } }`.
   - Call `POST /v1/invoice` with:
     - `price_amount: package.dollarAmount`, `price_currency: 'usd'`
     - `order_id: orderId`
     - `order_description: "<credits> credits top-up"`
     - `ipn_callback_url: ${SITE_URL}/api/nowpayments/webhook`
     - `success_url`, `cancel_url` mirroring Stripe's
     - `pay_currency` whitelist (optional, hosted page lets user pick from
       enabled coins)
   - Update the pending row's metadata with the returned `invoiceId`.
   - Return `invoice_url`.
3. Client redirects to `invoice_url`.
4. IPN webhook:
   - Read raw body, verify HMAC-SHA512, parse JSON.
   - Switch on `payment_status`:
     - `finished` → atomically look up the pending row by `(provider='nowpayments',
       reference_id=order_id)`, set `amount = credits` and
       `metadata.status = 'finished'`, then call `increment_user_credits` RPC.
     - `partially_paid` → update metadata, Sentry breadcrumb, no credit grant.
     - `failed` / `expired` / `refunded` → update metadata, Sentry breadcrumb,
       no credit grant.
   - Return 200 (400 only on invalid signature).

We persist the pending row up-front because the IPN payload echoes only
`order_id` and amount — without it we'd have to retain user → invoice mapping
elsewhere (Redis or otherwise) to handle race conditions where the IPN beats
the user back to the success page.

### 5. UI changes

- `apps/web/app/[lang]/(dashboard)/dashboard/credits/page.tsx` — wrap the
  top-up section in `<Tabs>`:
  - Tab 1: *Card* — existing `credit-topup.tsx`.
  - Tab 2: *Crypto* — new `crypto-topup.tsx`, with a one-line disclaimer
    about crypto confirmation times.
- `crypto-topup.tsx` mirrors `credit-topup.tsx`: same cards, same pricing,
  same `Buy Credits` CTA wired to `createCryptoTopupCheckout`.
- `credit-history.tsx` — render a small provider icon (card / coin) per row,
  reading from the new `provider` column.

### 6. Webhook security

- Body must be read as raw text *before* `JSON.parse` (same pattern as
  `stripe/webhook/route.ts` line 18).
- `verifySignature`:
  - Recursively sort all object keys (NowPayments quirk — applies to nested
    objects and arrays-of-objects).
  - `crypto.createHmac('sha512', IPN_SECRET).update(sortedJson).digest('hex')`.
  - Compare to `x-nowpayments-sig` via `crypto.timingSafeEqual`.
- Reject non-matching with 400; no Sentry noise on signature failures
  (they're typically scanners).

### 7. Idempotency / safety

- Composite unique `(provider, reference_id)` blocks double-credit at DB
  level.
- `reference_id` semantics:
  - Top-ups: our generated `order_id` (echoed back by NowPayments in IPN).
  - Subscription payments (v2): NowPayments `payment_id` (unique per cycle).
- All credit grants go through the existing `increment_user_credits` RPC; no
  new mutation path.

### 8. Environment variables (`.env.example`)

```env
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
NOWPAYMENTS_SANDBOX=false
NOWPAYMENTS_PAY_CURRENCIES=btc,eth,usdttrc20,usdcmatic,sol,ltc
```

For v2 (subscriptions), add:

```env
NOWPAYMENTS_EMAIL=
NOWPAYMENTS_PASSWORD=
NOWPAYMENTS_SUB_5_PLAN_ID=
NOWPAYMENTS_SUB_10_PLAN_ID=
NOWPAYMENTS_SUB_99_PLAN_ID=
```

### 9. Tests

- Unit: `verifySignature` happy path with a known-good fixture from
  NowPayments docs + negative case (tampered body, wrong secret).
- Unit: key-sorter handles nested objects, arrays of objects, and primitive
  values.
- Integration (manual, sandbox): full top-up flow against
  `api-sandbox.nowpayments.io`.

## Implementation order

1. Migration + queries refactor (thread `provider` through the existing
   `insertTopupCreditTransaction`; default `'stripe'` for backwards compat).
2. `lib/nowpayments/*` (client, invoice, ipn, types) + HMAC unit tests.
3. Server action `actions/nowpayments.ts` + webhook route (top-up happy path).
4. UI: Tabs on `/dashboard/credits`, new `crypto-topup.tsx`, provider icon
   in `credit-history.tsx`.
5. End-to-end sandbox test against `api-sandbox.nowpayments.io`.
6. Polish: `partially_paid`, `expired`, `refunded` handling; Sentry tags
   `section: 'nowpayments_webhook'`; admin recovery script for stuck
   pending invoices.

## v2 scope (not in this PR)

- `crypto_subscriptions` table to mirror what Redis caches for Stripe.
- JWT auth (`/v1/auth`) caching in Redis with 5-min TTL.
- `lib/nowpayments/subscriptions.ts`: createSubscriber, deleteSubscriber,
  listPayments.
- Plans bootstrap script in `scripts/` to create the 3 plans and print their
  IDs for env config.
- IPN handling for recurring `purchase`-type credits, applying the same 15%
  bonus multiplier as Stripe subscriptions.
- Cancel flow in dashboard.
- User-facing disclaimer: *"Crypto subscriptions send you an email reminder
  each cycle — you'll need to confirm payment manually."*

## Open risks

- **Sandbox vs production parity.** NowPayments' sandbox occasionally behaves
  differently around IPN timing; budget for a production smoke test with a
  $1 invoice before announcing.
- **Stuck pending invoices.** A user could create an invoice and never pay;
  we'll accumulate `metadata.status='pending'` rows with `amount=0`. These
  don't affect credit balance, but a periodic cleanup job (or filter in
  `credit-history.tsx`) keeps the history clean.
- **Refunds.** NowPayments refunds are manual. If we see `payment_status:
  refunded` after we've credited, we need to insert a compensating
  `refund`-type row. The enum already supports `refund` — handler stub is
  cheap to add now even if rare.
