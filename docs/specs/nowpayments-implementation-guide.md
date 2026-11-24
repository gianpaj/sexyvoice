# NowPayments Integration — Implementation Guide

Companion to [`nowpayments-integration.md`](./nowpayments-integration.md). That
document is the *what/why*; this is the *how*, step by step, with the exact
files, signatures, and patterns to follow from the existing Stripe code.

Branch: `claude/add-nowpayments-integration-HyvHg`
Scope: v1 only (one-time crypto top-ups). Crypto subscriptions are v2.

## Prerequisites

- NowPayments account with API key + IPN secret (sandbox + production).
- Read the Stripe equivalents first — they are the templates:
  - `apps/web/app/[lang]/actions/stripe.ts`
  - `apps/web/app/api/stripe/webhook/route.ts`
  - `apps/web/lib/supabase/queries.ts` (`insertTopupCreditTransaction`,
    `updateUserCredits`, `getUserIdByStripeCustomerId`)

---

## Step 1 — DB migration + queries refactor

### 1a. Migration file

Create `apps/web/supabase/migrations/<timestamp>_add_provider_to_credit_transactions.sql`
(timestamp format `YYYYMMDDHHMMSS`, matching existing files).

```sql
-- Add provider column
ALTER TABLE credit_transactions
  ADD COLUMN provider TEXT NOT NULL DEFAULT 'stripe'
  CHECK (provider IN ('stripe', 'nowpayments'));

-- Drop all existing reference_id uniqueness structures
DROP INDEX IF EXISTS public.credit_transactions_reference_id_idx;
DROP INDEX IF EXISTS public.unique_reference_topup_idx;
DROP INDEX IF EXISTS public.unique_reference_purchase_idx;
ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS reference_id_required_for_payments;

-- Provider-aware composite uniqueness (per-provider dedupe)
CREATE UNIQUE INDEX unique_provider_reference_id_idx
  ON credit_transactions USING btree (provider, reference_id)
  WHERE reference_id IS NOT NULL;

-- Recreate the payment-type reference_id requirement
ALTER TABLE credit_transactions
  ADD CONSTRAINT reference_id_required_for_payments
  CHECK (
    (type IN ('purchase', 'topup') AND reference_id IS NOT NULL)
    OR (type NOT IN ('purchase', 'topup'))
  );

COMMENT ON COLUMN credit_transactions.provider IS
  'Payment provider for this transaction: stripe or nowpayments.';
```

Verify against the current schema first — the live indexes come from
`20260105154300_remove_usage_from_credit_transaction_type.sql` (recreates
`unique_reference_topup_idx` / `unique_reference_purchase_idx` and the check
constraint) and `20250401150000` (`credit_transactions_reference_id_idx`).

After the migration, regenerate the DB types so `Tables<'credit_transactions'>`
includes `provider` (whatever command the repo uses — check `package.json`
scripts for `supabase gen types`).

### 1b. Queries refactor

In `apps/web/lib/supabase/queries.ts`:

- `insertTopupCreditTransaction` — add a `provider` parameter
  (default `'stripe'`). Thread it into the `.insert({ ... })` call.
- **Critical:** update the duplicate-check SELECT (line ~412) to filter on
  provider, otherwise a Stripe `payment_intent` and a NowPayments `order_id`
  with the same string value collide:
  ```ts
  .eq('user_id', userId)
  .eq('provider', provider)        // add this
  .eq('reference_id', paymentIntentId)
  ```
- Do the same in `insertSubscriptionCreditTransaction` (line ~339) for
  consistency, even though v1 doesn't use it for NowPayments — pass
  `provider: 'stripe'` explicitly.
- The Stripe callers in `stripe/webhook/route.ts` don't pass `provider`, so
  the default keeps them working unchanged.

---

## Step 2 — `lib/nowpayments/*` + HMAC unit tests

Create `apps/web/lib/nowpayments/`:

### `client.ts`

Thin `fetch` wrapper. Base URL toggles on `NOWPAYMENTS_SANDBOX`:
- prod: `https://api.nowpayments.io/v1`
- sandbox: `https://api-sandbox.nowpayments.io/v1`

Sends `x-api-key: NOWPAYMENTS_API_KEY` header. Throws on non-2xx with the
response body in the error for Sentry.

### `types.ts`

Type the `POST /v1/invoice` response (`id`, `invoice_url`, `order_id`, …) and
the IPN payload (`payment_id`, `payment_status`, `order_id`, `price_amount`,
`pay_amount`, `actually_paid`, `outcome_amount`, …). Define a
`PaymentStatus` union: `'waiting' | 'confirming' | 'confirmed' | 'sending' |
'finished' | 'partially_paid' | 'failed' | 'refunded' | 'expired'`.

### `invoice.ts`

```ts
createInvoice({ priceAmountUsd, orderId, orderDescription, payCurrencies })
  → POST /v1/invoice → returns the parsed invoice response
```

Body fields: `price_amount`, `price_currency: 'usd'`, `order_id`,
`order_description`, `ipn_callback_url`, `success_url`, `cancel_url`,
`pay_currencies` (array, from `NOWPAYMENTS_PAY_CURRENCIES.split(',')`).

### `ipn.ts` — `verifySignature(rawBody: string, sigHeader: string | null)`

This is the security-critical piece. Follow the spec §6 exactly:

1. `JSON.parse(rawBody)`, then **recursively sort all object keys** (applies to
   nested objects and arrays-of-objects).
2. Serialize with **no whitespace**: `JSON.stringify(sorted)` (default — no
   spacer argument).
3. `crypto.createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET!).update(sortedJson, 'utf8').digest('hex')`.
4. Compare to `sigHeader` with `crypto.timingSafeEqual`:
   ```ts
   const expected = Buffer.from(computedHex, 'hex');
   const received = Buffer.from(sigHeader ?? '', 'hex');
   if (expected.length !== received.length) return false;  // avoid throw
   return crypto.timingSafeEqual(expected, received);
   ```

### Unit tests — `lib/nowpayments/__tests__/ipn.test.ts`

- `verifySignature` happy path with a known-good fixture (compute a fixture
  with a test secret).
- Negative cases: tampered body, wrong secret, malformed/short header.
- Key-sorter: nested objects, arrays of objects, primitive values.

Use whatever test runner the repo uses — check for `vitest`/`jest` config.

---

## Step 3 — Server action + webhook route

### 3a. `apps/web/app/[lang]/actions/nowpayments.ts`

Mirror `actions/stripe.ts`. `'use server'` at top.

```ts
export async function createCryptoTopupCheckout(
  data: FormData,
  packageId: CheckoutPackageId,   // reuse the Exclude<PackageType, 'free'> type
): Promise<{ url: string }>
```

Flow (spec §4):
1. Validate `packageId` against `getTopupPackages('en')` keys excluding `free`
   (copy the `isCheckoutPackageId` guard from `stripe.ts`).
2. `createClient()` → `supabase.auth.getUser()`. Throw if no user.
3. `const pkg = getTopupPackages('en')[packageId]`.
4. `const orderId = "topup_" + user.id + "_" + nanoid()` — JS variable
   `orderId`; it becomes the NowPayments `order_id` field and the DB
   `reference_id` column.
5. Insert pending row via a new query helper (see 3c) — `createAdminClient()`,
   `{ provider: 'nowpayments', reference_id: orderId, amount: 0, type:
   'topup', user_id, description, metadata: { status: 'pending', packageId,
   credits: pkg.credits, dollarAmount: pkg.dollarAmount } }`.
6. `createInvoice({ priceAmountUsd: pkg.dollarAmount, orderId, orderDescription:
   \`${pkg.credits} credits top-up\`, payCurrencies:
   process.env.NOWPAYMENTS_PAY_CURRENCIES!.split(',') })`. The
   `ipn_callback_url` is `\`${process.env.NEXT_PUBLIC_SITE_URL}/api/nowpayments/webhook\``.
7. Update the pending row's `metadata` with the returned `invoiceId`.
8. `return { url: invoice.invoice_url }`.

Wrap in try/catch with `captureException`, tags `section: 'nowpayments_actions'`.

### 3b. `apps/web/app/api/nowpayments/webhook/route.ts`

Mirror `stripe/webhook/route.ts` structure.

```ts
export async function POST(req: Request) {
  const body = await req.text();                       // raw, before JSON.parse
  const sig = req.headers.get('x-nowpayments-sig');
  if (!verifySignature(body, sig)) {
    return NextResponse.json({}, { status: 400 });     // no Sentry — scanners
  }
  const payload = JSON.parse(body) as IpnPayload;
  try {
    await processIpn(payload);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { section: 'nowpayments_webhook', event_type: payload.payment_status },
      extra: { order_id: payload.order_id, payment_id: payload.payment_id },
    });
  }
  return NextResponse.json({ received: true });        // always 200 past sig check
}
```

`processIpn` switches on `payment_status`:
- **`finished`** → call the atomic RPC from 3c. The RPC itself does the
  idempotency guard + record update + credit increment in one transaction.
- **`partially_paid`** → update `metadata.status`, `Sentry.addBreadcrumb`, no
  credit grant. (Policy: full payment required in v1.)
- **`failed` / `expired`** → update `metadata.status`, breadcrumb, no grant.
- **`refunded`** → call the refund RPC from 3c.
- default (`waiting`/`confirming`/`confirmed`/`sending`) → update
  `metadata.status` only.

### 3c. New DB function + query helpers

Supabase's JS client can't span multiple statements in one transaction, so the
spec's "single DB transaction" requirement means **a Postgres function**. Add a
second migration (or fold into Step 1's):

```sql
-- Atomic: idempotency guard + record update + credit grant
CREATE OR REPLACE FUNCTION grant_nowpayments_topup(
  order_id_var TEXT,
  credit_amount_var INTEGER
) RETURNS VOID AS $$
DECLARE
  tx credit_transactions%ROWTYPE;
BEGIN
  SELECT * INTO tx FROM credit_transactions
    WHERE provider = 'nowpayments' AND reference_id = order_id_var
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nowpayments tx not found: %', order_id_var;
  END IF;
  IF tx.metadata->>'status' = 'finished' THEN
    RETURN;  -- idempotency guard: already granted
  END IF;
  UPDATE credit_transactions
    SET amount = credit_amount_var,
        metadata = jsonb_set(metadata, '{status}', '"finished"')
    WHERE id = tx.id;
  PERFORM increment_user_credits(tx.user_id, credit_amount_var);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Add a `refund_nowpayments_topup` counterpart: guard on
`metadata.status = 'finished'`, insert a `refund`-type row, `PERFORM
decrement_user_credits(...)`. `decrement_user_credits` already exists (used in
`queries.ts:178` and `:594`).

Then add thin wrappers in `queries.ts`:
`insertPendingCryptoTopup(...)`, `grantNowpaymentsTopup(orderId, credits)`,
`refundNowpaymentsTopup(orderId, credits)` — each calls `.rpc(...)` with
`createAdminClient()`.

---

## Step 4 — UI

### `apps/web/app/[lang]/(dashboard)/dashboard/credits/page.tsx`

- Add `provider` to the transactions select:
  `.select('id, created_at, description, type, amount, provider')`.
- Wrap the top-up section in `<Tabs>` (component at `@/components/ui/tabs`):
  - Tab *Card* → existing `<CreditTopup />`.
  - Tab *Crypto* → new `<CryptoTopup />` + one-line disclaimer about crypto
    confirmation times.

### `apps/web/app/[lang]/(dashboard)/dashboard/credits/crypto-topup.tsx`

Copy `credit-topup.tsx`. Changes:
- Import and call `createCryptoTopupCheckout` instead of `createCheckoutSession`.
- The action returns `{ url }` only (no `client_secret`) — simplify
  `formAction` accordingly; drop the `uiMode` hidden input.
- Render only the three purchasable tiers (`starter`, `standard`, `pro`) —
  skip `free` (`dollarAmount === 0`). The `plans` array already only lists
  those three, so just keep it as-is; do not add `free`.

### `apps/web/app/[lang]/(dashboard)/dashboard/credits/credit-history.tsx`

- Add `'provider'` to the `Pick<Tables<'credit_transactions'>, ...>` prop type.
- Render a small icon per row from `transaction.provider` (card icon for
  `stripe`, coin icon for `nowpayments` — `lucide-react` has `CreditCard` and
  `Bitcoin`/`Coins`).

---

## Step 5 — End-to-end sandbox test

- Set `NOWPAYMENTS_SANDBOX=true` + sandbox API key/IPN secret locally.
- Use a tunnel (e.g. the repo's existing dev tunnel setup) so the sandbox can
  reach `/api/nowpayments/webhook`.
- Run the full flow: Crypto tab → pick a tier → pay on the hosted invoice →
  confirm the IPN transitions land and credits are granted exactly once.
- Re-send the same `finished` IPN manually to confirm the idempotency guard
  holds (no double credit).

---

## Step 6 — Polish

- `partially_paid` / `expired` / `refunded` handler branches fully wired.
- Sentry tags `section: 'nowpayments_webhook'` on all captures.
- Admin recovery script in `scripts/` for stuck `metadata.status='pending'`
  rows (list invoices older than N hours still pending; optionally re-query
  NowPayments `GET /v1/payment/{id}` to reconcile).
- Production smoke test with a real $1 invoice before announcing (spec "Open
  risks").

---

## Environment variables

Add to `apps/web/.env.example`:

```env
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
NOWPAYMENTS_SANDBOX=false
NOWPAYMENTS_PAY_CURRENCIES=btc,eth,usdttrc20,usdcmatic,sol,ltc
```

Set the real values in Vercel project settings for preview + production.

## Done-when checklist

- [ ] Migration applied; `provider` column + `unique_provider_reference_id_idx`
      + recreated check constraint present; DB types regenerated.
- [ ] `insertTopupCreditTransaction` / `insertSubscriptionCreditTransaction`
      duplicate-check queries filter on `provider`.
- [ ] `verifySignature` unit tests pass (happy + tampered + wrong-secret +
      key-sorter cases).
- [ ] `grant_nowpayments_topup` is idempotent under repeated `finished` IPNs.
- [ ] Crypto tab renders three tiers, redirects to the hosted invoice.
- [ ] `credit-history.tsx` shows a provider icon per row.
- [ ] Full sandbox top-up flow grants credits exactly once.
- [ ] Stripe top-up flow still works unchanged (regression check).
