# Technical Specification: Stripe Webhook Route Unit Testing Implementation

## 1. Objective

Implement a comprehensive unit test suite for the Next.js Stripe webhook route handler that processes subscription lifecycle events and checkout sessions. The tests must validate webhook signature verification, event handling, database synchronization, Redis caching, and error reporting using Mock Service Worker (MSW) and Stripe's built-in test utilities.

## 2. Project Context

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript 5
- **Testing Framework**: Vitest with MSW (Mock Service Worker)
- **Package Manager**: pnpm 9
- **External Dependencies**: Stripe SDK, Upstash Redis, Sentry, Supabase
- **Route Location**: `app/api/stripe/webhook/route.ts`

## 3. Architecture Overview

### 3.1 Webhook Flow
1. Stripe sends webhook event with signature header
2. Route validates signature using `stripe.webhooks.constructEvent()`
3. Event is processed based on type (`checkout.session.completed`, subscription events, etc.)
4. Data synced to Supabase database and Redis cache
5. Credits awarded for topups and subscriptions
6. Errors logged to Sentry

### 3.2 Key Functions
- `POST()` - Main route handler with signature verification
- `processEvent()` - Event type router
- `handleCheckoutSessionCompleted()` - Handles topups and subscription checkouts
- `handlePaymentIntentSucceeded()` - Payment confirmation handler
- `syncStripeDataToKV()` - Syncs subscription data to Redis and awards credits

## 4. Required Files

### 4.1 File Structure

```
tests/
├── setup.ts                          # Already exists with MSW configuration
├── stripe-webhook.test.ts            # New test file
├── generate-voice.test.ts            # Existing reference
└── README.md                         # Already exists
```

## 5. Test Suite Implementation

### 5.1 File: tests/stripe-webhook.test.ts

#### 5.1.1 Test Structure Overview

```
Stripe Webhook Route Tests
├── Setup & Mock Configuration
│   ├── Stripe mock with generateTestHeaderString
│   ├── MSW handlers for Supabase & Redis
│   └── Mock pricing packages
├── Signature Verification
│   ├── Missing stripe-signature header
│   ├── Invalid webhook signature
│   └── Valid signature with generateTestHeaderString
├── Checkout Session Events
│   ├── One-time topup (mode: 'payment')
│   │   ├── Credits awarded
│   │   ├── Transaction recorded
│   │   └── Metadata validation
│   └── Subscription checkout (mode: 'subscription')
│       ├── Customer data synced to Redis
│       └── Initial subscription credits awarded
├── Subscription Lifecycle Events
│   ├── customer.subscription.created
│   ├── customer.subscription.updated
│   ├── customer.subscription.deleted
│   ├── customer.subscription.paused
│   ├── customer.subscription.resumed
│   └── customer.subscription.trial_will_end
├── Invoice Events
│   ├── invoice.paid
│   ├── invoice.payment_failed
│   └── invoice.payment_succeeded
├── Payment Intent Events
│   ├── payment_intent.succeeded
│   └── payment_intent.payment_failed
├── Data Synchronization (syncStripeDataToKV)
│   ├── Starter plan credits (5,000)
│   ├── Standard plan credits (15,000)
│   ├── Pro plan credits (50,000)
│   └── Redis cache updates
├── Edge Cases
│   ├── Customer with no subscriptions
│   ├── User not found in database
│   ├── Missing payment method
│   ├── Missing topup metadata
│   └── Multiple subscriptions (takes first)
└── Error Handling
    ├── Sentry error reporting
    ├── Database operation failures
    └── Stripe API errors
```

#### 5.1.2 Mock Implementation Using Stripe's Official Method

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/stripe/webhook/route';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';

// Create real Stripe instance for test signature generation
const stripeForTesting = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2024-12-18.acacia',
});

const WEBHOOK_SECRET = 'whsec_test_secret_for_testing';

// Mock modules
vi.mock('@/lib/stripe/stripe-admin', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
    subscriptions: {
      list: vi.fn(),
    },
  },
}));

vi.mock('@/lib/supabase/queries', () => ({
  getUserIdByStripeCustomerId: vi.fn(),
  insertCreditTransaction: vi.fn(),
  insertTopupTransaction: vi.fn(),
}));

vi.mock('@/lib/redis/queries', () => ({
  setCustomerData: vi.fn(),
}));

vi.mock('@/lib/stripe/pricing', () => ({
  getTopupPackages: vi.fn(() => ({
    starter: { credits: 5000, amount: 5 },
    standard: { credits: 15000, amount: 15 },
    pro: { credits: 50000, amount: 50 },
  })),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));
```

#### 5.1.3 Helper Functions

```typescript
/**
 * Creates a valid Stripe webhook request with proper signature
 * Uses Stripe's official generateTestHeaderString method
 */
function createWebhookRequest(event: Stripe.Event): Request {
  const payload = JSON.stringify(event);
  
  // Generate valid signature using Stripe's built-in method
  const signature = stripeForTesting.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });

  return {
    text: async () => payload,
    headers: {
      get: (name: string) => {
        if (name === 'Stripe-Signature') return signature;
        return null;
      },
    },
  } as unknown as Request;
}

/**
 * Creates mock Stripe events for testing
 */
function createMockEvent<T extends Stripe.Event.Type>(
  type: T,
  data: any,
): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2024-12-18.acacia',
    created: Math.floor(Date.now() / 1000),
    type,
    data: {
      object: data,
    },
    livemode: false,
    pending_webhooks: 0,
    request: {
      id: null,
      idempotency_key: null,
    },
  } as Stripe.Event;
}

/**
 * Creates mock subscription object
 */
function createMockSubscription(
  priceId: string,
  status: Stripe.Subscription.Status = 'active',
): Stripe.Subscription {
  return {
    id: 'sub_test123',
    object: 'subscription',
    customer: 'cus_test123',
    status,
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 2592000, // +30 days
    cancel_at_period_end: false,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test',
          object: 'subscription_item',
          price: {
            id: priceId,
            object: 'price',
            active: true,
            currency: 'usd',
            unit_amount: 1500,
            type: 'recurring',
            recurring: {
              interval: 'month',
              interval_count: 1,
            },
          } as any,
        } as any,
      ],
    } as any,
    default_payment_method: {
      id: 'pm_test',
      object: 'payment_method',
      card: {
        brand: 'visa',
        last4: '4242',
      },
    } as any,
  } as Stripe.Subscription;
}

/**
 * Creates mock checkout session
 */
function createMockCheckoutSession(
  mode: 'payment' | 'subscription',
  metadata?: Record<string, string>,
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    mode,
    customer: 'cus_test123',
    payment_intent: mode === 'payment' ? 'pi_test123' : null,
    subscription: mode === 'subscription' ? 'sub_test123' : null,
    metadata: metadata || {},
    payment_status: 'paid',
    status: 'complete',
  } as any;
}
```

#### 5.1.4 Test Cases

##### Test Case 1: Signature Verification

```typescript
describe('Stripe Webhook Route', () => {
  describe('Signature Verification', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return 400 when stripe-signature header is missing', async () => {
      const request = {
        text: async () => JSON.stringify({}),
        headers: {
          get: () => null,
        },
      } as unknown as Request;

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('should return 200 with valid signature using generateTestHeaderString', async () => {
      const event = createMockEvent('checkout.session.completed', 
        createMockCheckoutSession('payment', {
          type: 'topup',
          userId: 'user_123',
          credits: '1000',
          dollarAmount: '10',
        })
      );

      // Mock the stripe.webhooks.constructEvent to return our event
      const { stripe } = await import('@/lib/stripe/stripe-admin');
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = createWebhookRequest(event);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ received: true });
    });

    it('should handle constructEvent throwing an error', async () => {
      const event = createMockEvent('checkout.session.completed', 
        createMockCheckoutSession('payment')
      );

      const { stripe } = await import('@/lib/stripe/stripe-admin');
      vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const request = createWebhookRequest(event);
      const response = await POST(request);

      // Should still return 200 (webhook acknowledged) but error logged
      expect(response.status).toBe(200);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});
```

##### Test Case 2: Checkout Session - Topup

```typescript
describe('Checkout Session - Topup', () => {
  it('should process topup checkout and award credits', async () => {
    const { insertTopupTransaction } = await import('@/lib/supabase/queries');
    
    const session = createMockCheckoutSession('payment', {
      type: 'topup',
      userId: 'user_123',
      credits: '5000',
      dollarAmount: '5.00',
      packageType: 'starter',
    });

    const event = createMockEvent('checkout.session.completed', session);
    
    const { stripe } = await import('@/lib/stripe/stripe-admin');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(insertTopupTransaction).toHaveBeenCalledWith(
      'user_123',
      'pi_test123',
      5000,
      5.00,
      'starter',
      null,
    );
  });

  it('should handle promo code in topup metadata', async () => {
    const { insertTopupTransaction } = await import('@/lib/supabase/queries');
    
    const session = createMockCheckoutSession('payment', {
      type: 'topup',
      userId: 'user_456',
      credits: '15000',
      dollarAmount: '12.00', // Discounted
      packageType: 'standard',
      promo: 'SAVE20',
    });

    const event = createMockEvent('checkout.session.completed', session);
    
    const { stripe } = await import('@/lib/stripe/stripe-admin');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    await POST(request);

    expect(insertTopupTransaction).toHaveBeenCalledWith(
      'user_456',
      'pi_test123',
      15000,
      12.00,
      'standard',
      'SAVE20',
    );
  });

  it('should log error and continue when topup metadata is missing', async () => {
    const session = createMockCheckoutSession('payment', {
      type: 'topup',
      // Missing userId, credits, dollarAmount
    });

    const event = createMockEvent('checkout.session.completed', session);
    
    const { stripe } = await import('@/lib/stripe/stripe-admin');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
```

##### Test Case 3: Checkout Session - Subscription

```typescript
describe('Checkout Session - Subscription', () => {
  it('should sync subscription data to Redis on checkout', async () => {
    const { setCustomerData } = await import('@/lib/redis/queries');
    const { stripe } = await import('@/lib/stripe/stripe-admin');
    const { getUserIdByStripeCustomerId, insertCreditTransaction } = 
      await import('@/lib/supabase/queries');

    const subscription = createMockSubscription('price_1QncR5J2uQQSTCBsWa87AaEG');
    
    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [subscription],
    } as any);

    vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user_789');

    const session = createMockCheckoutSession('subscription');
    const event = createMockEvent('checkout.session.completed', session);
    
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    await POST(request);

    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: 'cus_test123',
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    expect(setCustomerData).toHaveBeenCalledWith(
      'cus_test123',
      expect.objectContaining({
        subscriptionId: 'sub_test123',
        status: 'active',
        priceId: 'price_1QncR5J2uQQSTCBsWa87AaEG',
      }),
    );

    expect(insertCreditTransaction).toHaveBeenCalled();
  });
});
```

##### Test Case 4: Subscription Lifecycle Events

```typescript
describe('Subscription Lifecycle Events', () => {
  it('should handle customer.subscription.created', async () => {
    const { setCustomerData } = await import('@/lib/redis/queries');
    const { stripe } = await import('@/lib/stripe/stripe-admin');

    const subscription = createMockSubscription('price_1QnczMJ2uQQSTCBsUzEnvPKj');
    
    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [subscription],
    } as any);

    const event = createMockEvent('customer.subscription.created', {
      ...subscription,
      customer: 'cus_test123',
    });
    
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(setCustomerData).toHaveBeenCalled();
  });

  it('should handle customer.subscription.updated', async () => {
    const { setCustomerData } = await import('@/lib/redis/queries');
    const { stripe } = await import('@/lib/stripe/stripe-admin');

    const subscription = createMockSubscription(
      'price_1QnkyTJ2uQQSTCBsgyw7xYb8', 
      'active'
    );
    
    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [subscription],
    } as any);

    const event = createMockEvent('customer.subscription.updated', {
      ...subscription,
      customer: 'cus_test123',
    });
    
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    await POST(request);

    expect(setCustomerData).toHaveBeenCalled();
  });

  it('should handle customer.subscription.deleted', async () => {
    const { setCustomerData } = await import('@/lib/redis/queries');
    const { stripe } = await import('@/lib/stripe/stripe-admin');

    const subscription = createMockSubscription(
      'price_1QncR5J2uQQSTCBsWa87AaEG',
      'canceled'
    );
    
    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [subscription],
    } as any);

    const event = createMockEvent('customer.subscription.deleted', {
      ...subscription,
      customer: 'cus_test123',
    });
    
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    await POST(request);

    expect(setCustomerData).toHaveBeenCalled();
  });
});
```

##### Test Case 5: Credit Award by Plan

```typescript
describe('Credit Awards by Plan', () => {
  const testPlans = [
    {
      name: 'Starter (test)',
      priceId: 'price_1QnczMJ2uQQSTCBsUzEnvPKj',
      expectedCredits: 5000,
      expectedAmount: 5,
    },
    {
      name: 'Standard (test)',
      priceId: 'price_1QncR5J2uQQSTCBsWa87AaEG',
      expectedCredits: 15000,
      expectedAmount: 15,
    },
    {
      name: 'Pro (test)',
      priceId: 'price_1QnkyTJ2uQQSTCBsgyw7xYb8',
      expectedCredits: 50000,
      expectedAmount: 50,
    },
  ];

  testPlans.forEach(({ name, priceId, expectedCredits, expectedAmount }) => {
    it(`should award ${expectedCredits} credits for ${name} plan`, async () => {
      const { stripe } = await import('@/lib/stripe/stripe-admin');
      const { getUserIdByStripeCustomerId, insertCreditTransaction } = 
        await import('@/lib/supabase/queries');

      const subscription = createMockSubscription(priceId, 'active');
      
      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
      } as any);

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user_credit_test');

      const event = createMockEvent('customer.subscription.created', {
        ...subscription,
        customer: 'cus_test123',
      });
      
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = createWebhookRequest(event);
      await POST(request);

      expect(insertCreditTransaction).toHaveBeenCalledWith(
        'user_credit_test',
        'sub_test123',
        expectedCredits,
        expectedAmount,
      );
    });
  });
});
```

##### Test Case 6: Edge Cases

```typescript
describe('Edge Cases', () => {
  it('should handle customer with no subscriptions', async () => {
    const { setCustomerData } = await import('@/lib/redis/queries');
    const { stripe } = await import('@/lib/stripe/stripe-admin');

    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [],
    } as any);

    const event = createMockEvent('customer.subscription.updated', {
      customer: 'cus_no_subs',
    });
    
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    await POST(request);

    expect(setCustomerData).toHaveBeenCalledWith(
      'cus_no_subs',
      { status: 'none' },
    );
  });

  it('should log error when user not found in database', async () => {
    const { stripe } = await import('@/lib/stripe/stripe-admin');
    const { getUserIdByStripeCustomerId } = await import('@/lib/supabase/queries');

    const subscription = createMockSubscription('price_1QncR5J2uQQSTCBsWa87AaEG');
    
    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [subscription],
    } as any);

    vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(null);

    const event = createMockEvent('customer.subscription.updated', {
      customer: 'cus_unknown',
    });
    
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    await POST(request);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          customer_id: 'cus_unknown',
        }),
      }),
    );
  });

  it('should handle subscription without payment method', async () => {
    const { setCustomerData } = await import('@/lib/redis/queries');
    const { stripe } = await import('@/lib/stripe/stripe-admin');

    const subscriptionWithoutPM = {
      ...createMockSubscription('price_1QncR5J2uQQSTCBsWa87AaEG'),
      default_payment_method: null,
    };
    
    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [subscriptionWithoutPM],
    } as any);

    const event = createMockEvent('customer.subscription.updated', {
      customer: 'cus_no_pm',
    });
    
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    await POST(request);

    expect(setCustomerData).toHaveBeenCalledWith(
      'cus_no_pm',
      expect.objectContaining({
        paymentMethod: null,
      }),
    );
  });

  it('should handle unrecognized event types gracefully', async () => {
    const { stripe } = await import('@/lib/stripe/stripe-admin');

    const event = createMockEvent('customer.created' as any, {
      id: 'cus_new',
    });
    
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });
});
```

##### Test Case 7: Error Handling

```typescript
describe('Error Handling', () => {
  it('should report database errors to Sentry', async () => {
    const { stripe } = await import('@/lib/stripe/stripe-admin');
    const { insertTopupTransaction } = await import('@/lib/supabase/queries');

    vi.mocked(insertTopupTransaction).mockRejectedValue(
      new Error('Database connection failed')
    );

    const session = createMockCheckoutSession('payment', {
      type: 'topup',
      userId: 'user_123',
      credits: '1000',
      dollarAmount: '10',
    });

    const event = createMockEvent('checkout.session.completed', session);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    await POST(request);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Database'),
      }),
      expect.objectContaining({
        tags: expect.objectContaining({
          section: 'stripe_webhook',
        }),
      }),
    );
  });

  it('should handle Stripe API errors gracefully', async () => {
    const { stripe } = await import('@/lib/stripe/stripe-admin');

    vi.mocked(stripe.subscriptions.list).mockRejectedValue(
      new Error('Stripe API error')
    );

    const event = createMockEvent('customer.subscription.updated', {
      customer: 'cus_error',
    });
    
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

    const request = createWebhookRequest(event);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
```

## 6. MSW Integration

### 6.1 Update tests/setup.ts

Add Stripe-specific MSW handlers if needed for external Stripe API calls (though most will be mocked directly):

```typescript
// Add to existing handlers array in setup.ts
export const stripeHandlers = [
  // Mock Stripe subscription list endpoint (if needed)
  http.get('https://api.stripe.com/v1/subscriptions', () => {
    return HttpResponse.json({
      data: [],
      has_more: false,
    });
  }),
];
```

## 7. Configuration

### 7.1 Environment Variables

Ensure these are set in `tests/setup.ts`:

```typescript
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_for_testing';
process.env.STRIPE_SECRET_KEY = 'sk_test_51...'; // Real test key for signature generation
process.env.KV_REST_API_URL = 'http://localhost:8079';
process.env.KV_REST_API_TOKEN = 'test_token';
```

### 7.2 Vitest Configuration

Create `vitest.config.ts` at project root:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.*',
        '.next/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

## 8. Validation Criteria

### 8.1 Test Execution Checklist

- [ ] All tests pass without errors
- [ ] No TypeScript compilation errors
- [ ] Signature verification tests use `generateTestHeaderString`
- [ ] All Stripe event types covered
- [ ] MSW handlers properly configured
- [ ] Test coverage > 85% for webhook route

### 8.2 Functional Validation

- [ ] Topup transactions create credit records
- [ ] Subscription checkouts sync to Redis
- [ ] Credit amounts correct for each plan tier
- [ ] Promo codes handled correctly
- [ ] Payment method data stored properly
- [ ] Missing metadata logged to Sentry
- [ ] User not found errors handled gracefully

### 8.3 Code Quality

- [ ] Follows project's Biome formatting rules
- [ ] Type-safe mock implementations
- [ ] DRY helper functions used
- [ ] Descriptive test names
- [ ] Comprehensive error scenario coverage

## 9. Running Tests

```bash
# Install dependencies (if not already installed)
pnpm add -D vitest @vitest/ui msw @vitest/coverage-v8

# Run all tests
pnpm test

# Run Stripe webhook tests specifically
pnpm test stripe-webhook

# Watch mode
pnpm test:watch

# With UI
pnpm test:ui

# With coverage
pnpm test:coverage
```

## 10. Key Differences from Original Plan

### 10.1 Using Stripe's Official Testing Method

Instead of mocking `constructEvent` with arbitrary signatures, we use:
- **`stripe.webhooks.generateTestHeaderString()`** - Official Stripe method
- Real webhook secret matching
- Authentic signature validation
- More reliable test scenarios

### 10.2 MSW Instead of Direct Mocks

Following the pattern from `generate-voice.test.ts`:
- **Mock Service Worker** for HTTP-level mocking
- Centralized mock configuration in `setup.ts`
- Realistic network request/response simulation
- Better test isolation

### 10.3 Updated Credit Amounts

Based on actual `getTopupPackages` pricing:
- **Starter**: 5,000 credits ($5)
- **Standard**: 15,000 credits ($15)
- **Pro**: 50,000 credits ($50)

### 10.4 Real Price IDs

Tests use actual Stripe price IDs from the codebase:
- **Starter Test**: `price_1QnczMJ2uQQSTCBsUzEnvPKj`
- **Standard Test**: `price_1QncR5J2uQQSTCBsWa87AaEG`
- **Pro Test**: `price_1QnkyTJ2uQQSTCBsgyw7xYb8`

## 11. References

### 11.1 Similar Test Implementation
See `tests/generate-voice.test.ts` for:
- MSW handler patterns
- Mock setup structure
- Test organization
- Error handling tests

### 11.2 Stripe Documentation
- [Stripe Node.js Testing](https://stripe.com/docs/testing)
- [Webhook Testing](https://stripe.com/docs/webhooks/test)
- [generateTestHeaderString](https://github.com/stripe/stripe-node#webhook-signing)

### 11.3 Project Resources
- `CLAUDE.md` - Project guidelines
- `tests/README.md` - Testing setup documentation
- `app/api/stripe/webhook/route.ts` - Implementation reference

## 12. Success Criteria

✅ **Task complete when**:

1. ✅