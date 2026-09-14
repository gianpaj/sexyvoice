# Plan: Coinbase Business Crypto Payments Integration

**Date:** 2026-04-22  
**Branch target:** `feat/coinbase-crypto-payments`

---

## Context

SexyVoice accepts fiat payments via Stripe (one-time topups + subscriptions). This adds **crypto payment** as an alternative for one-time credit topups ($5/$10/$75), using the **Coinbase Business Checkouts API** (the current replacement for Coinbase Commerce, shut down March 31, 2026).

Subscriptions stay Stripe-only. Crypto covers `topup` transactions only.

---

## Flow

```
User clicks "Pay with Crypto"
  └── PlanCard: second useActionState → createCoinbaseCheckoutSession(formData, packageId)
        └── POST https://business.coinbase.com/api/v1/checkouts  (JWT auth)
              └── Store coinbase:checkout:{id} → {userId, packageId, credits, dollarAmount} in Redis (TTL 2h)
              └── Return { url: hosted_url }
        └── window.location.assign(hosted_url)

User pays on Coinbase-hosted page
  └── Coinbase fires POST /api/coinbase/webhook
        └── Verify X-Hook0-Signature (HMAC-SHA256, node:crypto)
        └── On charge:confirmed → Redis GET coinbase:checkout:{checkoutId}
        └── insertTopupCreditTransaction(userId, checkoutId, credits, dollarAmount, packageId)
              └── Deduplication via reference_id = checkoutId (same logic as Stripe)
        └── Return 200 { received: true }
```

---

## Dependency: `jose`

`jose` is **not** in `apps/web/package.json`. It must be added. It is needed to sign Ed25519 JWTs for the Coinbase CDP API authentication (2-minute TTL bearer tokens). Using `jose` over manual `crypto.subtle` avoids hand-rolling Base64URL encoding and JWT structure.

Add to `apps/web/package.json` dependencies:
```
"jose": "^5.x"
```

---

## Files to Create

### `apps/web/lib/coinbase/coinbase-admin.ts`

Three exports:

1. **`getCoinbaseJWT(method, path)`** — builds a short-lived Ed25519 JWT:
   - Header: `{ alg: "EdDSA", kid: COINBASE_API_KEY_ID, typ: "JWT" }`
   - Claims: `{ iss: "cdp", sub: COINBASE_API_KEY_ID, nbf: now, exp: now+120, uri: "<METHOD> business.coinbase.com<path>" }`
   - Signs with `COINBASE_API_KEY_SECRET` (PEM) via `jose`'s `SignJWT`

2. **`createCoinbaseCheckout({ packageId, credits, dollarAmount, successUrl, cancelUrl })`** — calls `POST https://business.coinbase.com/api/v1/checkouts`, returns `{ id, hosted_url }`.

3. **`verifyCoinbaseWebhookSignature(rawBody, signatureHeader, secret)`** — HMAC-SHA256 via `node:crypto`'s `createHmac` + `timingSafeEqual` (same pattern as `lib/supabase/oauth-callback-marker.ts`). ⚠️ Exact header name and signed-payload format must be validated (see Open Questions).

### `apps/web/app/[lang]/actions/coinbase.ts`

```typescript
'use server';

export async function createCoinbaseCheckoutSession(
  data: FormData,
  packageId: PackageType,
): Promise<{ url: string | null }>
```

- Gets authenticated user (same `supabase.auth.getUser()` pattern as `stripe.ts`)
- Looks up package from `getTopupPackages('en')` in `lib/stripe/pricing.ts` (provider-agnostic, despite the path)
- Calls `createCoinbaseCheckout()` from `coinbase-admin.ts`
- Stores pending metadata in Redis via new helper (see below)
- Returns `{ url }` on success, catches + Sentry-reports on failure

### `apps/web/app/api/coinbase/webhook/route.ts`

Mirror structure of `app/api/stripe/webhook/route.ts`:

- `POST` handler reads raw body via `req.text()` (not `req.json()`)
- Reads `X-Hook0-Signature` header (⚠️ validate name)
- Calls `verifyCoinbaseWebhookSignature()`; returns 400 if invalid
- Handles `charge:confirmed` event (⚠️ validate exact name): looks up `coinbase:checkout:{checkoutId}` from Redis, calls `insertTopupCreditTransaction()`
- Always returns `NextResponse.json({ received: true })` with 200
- Sentry tags: `section: 'coinbase_webhook'`

---

## Files to Modify

### `apps/web/lib/redis/queries.ts`

Add two helpers alongside the existing `setCustomerData`/`getCustomerData` pattern. Use the same `getRedisClient()` accessor:

```typescript
const COINBASE_CHECKOUT_TTL = 60 * 60 * 2; // 2 hours

export interface CoinbaseCheckoutData {
  userId: string;
  packageId: string;
  credits: number;
  dollarAmount: number;
}

export function setCoinbaseCheckoutData(checkoutId: string, data: CoinbaseCheckoutData) {
  return getRedisClient().set(
    `coinbase:checkout:${checkoutId}`,
    JSON.stringify(data),
    { ex: COINBASE_CHECKOUT_TTL },
  );
}

export async function getCoinbaseCheckoutData(
  checkoutId: string,
): Promise<CoinbaseCheckoutData | null> {
  const result = await getRedisClient().get(`coinbase:checkout:${checkoutId}`);
  if (!result) return null;
  if (typeof result === 'string') return JSON.parse(result);
  return result as CoinbaseCheckoutData;
}
```

Note: `@upstash/redis` `set()` accepts `{ ex: seconds }` for TTL. `ioredis` (test client) accepts `setex`. Make the helper work for both: use `getRedisClient().set(key, value, 'EX', ttl)` via raw string args which both clients support, or keep the upstash syntax and accept that TTL is skipped in tests (same approach the existing helpers take — they don't set TTLs either).

### `apps/web/app/[lang]/(dashboard)/dashboard/credits/credit-topup.tsx`

Add a second `useActionState` to `PlanCard` for the Coinbase action, plus a second `<form>`:

```tsx
const [cryptoState, cryptoFormAction, cryptoPending] = useActionState(
  async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const packageId = formData.get('packageId') as PackageType;
    const { url } = await createCoinbaseCheckoutSession(formData, packageId);
    if (url) { window.location.assign(url); return { error: null, success: true }; }
    return { error: creditsDict.status.checkoutError, success: false };
  },
  initialState,
);
```

Add below the existing Stripe `<form>`:
```tsx
<form action={cryptoFormAction}>
  <input name="packageId" type="hidden" value={plan.id} />
  <Button className="w-full" disabled={cryptoPending} type="submit" variant="outline">
    {cryptoPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{creditsDict.topup.processing}</> : 'Pay with Crypto'}
  </Button>
</form>
```

The "Pay with Crypto" label is hardcoded English for now (no i18n key needed initially). The button appears for all 3 plans; Base network fees (~$0.01) make the $5 starter viable.

### `apps/web/.env.example`

Add after the Stripe block:
```bash
# Coinbase CDP (server-side only)
COINBASE_API_KEY_ID=           # e.g. organizations/xxx/apiKeys/yyy
COINBASE_API_KEY_SECRET=       # Ed25519 private key (PEM, multiline)
COINBASE_WEBHOOK_SECRET=       # Webhook shared secret from Coinbase Business dashboard
```

---

## Functions Reused (no changes)

| Function | File | Notes |
|---|---|---|
| `insertTopupCreditTransaction()` | `lib/supabase/queries.ts:400` | Pass `checkoutId` as `paymentIntentId`; deduplication via `reference_id` works unchanged |
| `getTopupPackages()` | `lib/stripe/pricing.ts` | Provider-agnostic despite path; returns credits + dollarAmount per packageId |
| `createAdminClient()` | `lib/supabase/server.ts` | Used inside `insertTopupCreditTransaction` already |
| `createHmac`, `timingSafeEqual` | `node:crypto` | Same pattern as `lib/supabase/oauth-callback-marker.ts` |

---

## Open Questions — Must Validate Before Implementing Webhook

These require a Coinbase Business account, CDP API key, and sandbox:

| # | Question | Impact | Validate by |
|---|---|---|---|
| 1 | Exact webhook header name (`X-Hook0-Signature` vs `X-CC-Webhook-Signature`)? | Breaks all webhooks if wrong | Check Business dashboard webhook setup page |
| 2 | Signed-payload format for HMAC (`t=.h=.v1=` scheme from draft, or Stripe-style `t=,v1=`)? | Wrong HMAC = reject all events | Send test webhook from dashboard, inspect raw header |
| 3 | Exact event name for completed payment (`charge:confirmed`? `charge.confirmed`?)? | Credits never awarded | Check Business webhook event list; fire test event |
| 4 | Does the Checkouts API support a `metadata` field in the POST body? | If yes, skip Redis and embed metadata directly (simpler, matches Stripe pattern) | Check `POST /api/v1/checkouts` request schema in Business API docs |
| 5 | Is the CDP API key algorithm ES256 (ECDSA P-256) or EdDSA (Ed25519)? | Determines JWT `alg` header and jose signing method | Check the key type shown in CDP dashboard when creating the key |
| 6 | Does checkout response include `hosted_url`? | Determines redirect field name | Create a test checkout, inspect response |
| 7 | Sandbox/testnet available? | Needed for end-to-end testing without real crypto | Check CDP dashboard for test mode |

**Recommendation:** Create the Coinbase Business account and a test checkout before writing the webhook handler, so you can fill in the exact event name and signature format. The server action and admin module can be written first since they only depend on the checkout creation response shape.

---

## Implementation Order

1. `npm install jose` in `apps/web/`
2. `apps/web/lib/coinbase/coinbase-admin.ts` — JWT auth + checkout creation + signature verification stub
3. `apps/web/lib/redis/queries.ts` — add `setCoinbaseCheckoutData` / `getCoinbaseCheckoutData`
4. `apps/web/app/[lang]/actions/coinbase.ts` — server action
5. `apps/web/app/api/coinbase/webhook/route.ts` — webhook handler (fill in event name + signature format from sandbox testing)
6. `apps/web/app/[lang]/(dashboard)/dashboard/credits/credit-topup.tsx` — add second form + button
7. `apps/web/.env.example` — add 3 env vars
8. `apps/web/tests/coinbase-webhook.test.ts` — mirror `stripe-webhook.test.ts` structure

---

## Verification

1. Run existing tests to confirm no regressions: `pnpm test`
2. Set `COINBASE_API_KEY_ID`, `COINBASE_API_KEY_SECRET`, `COINBASE_WEBHOOK_SECRET` in `.env.local`
3. Hit the server action directly or via the UI — confirm `hosted_url` is returned and redirect fires
4. Complete a test payment in Coinbase sandbox → confirm webhook fires
5. Check Supabase `credit_transactions` table: new row with `type='topup'`, `reference_id=<checkoutId>`, correct `amount`
6. Replay the same webhook → confirm duplicate row is NOT inserted (dedup check)
7. Confirm credits balance updates in dashboard UI
8. Complete a Stripe topup → confirm Stripe flow still works (no regression)