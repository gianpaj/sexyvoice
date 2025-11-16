# API Route Testing Setup

This directory contains comprehensive tests for the SexyVoice.ai API routes and utility functions, including the `generate-voice` endpoint, `stripe-webhook` handler, and `stripe-admin` functions.</parameter>

## Setup Requirements

Before running the tests, install the required dependencies:

```bash
pnpm add -D vitest @vitest/ui msw @types/supertest supertest @vitest/coverage-v8
```

## Test Structure

### Files:
- `setup.ts` - Test environment setup with MSW mocking
- `generate-voice.test.ts` - Comprehensive tests for the generate voice API route
- `stripe-webhook.test.ts` - Comprehensive tests for Stripe webhook handling
- `test-stripe-plan.md` - Detailed technical specification for Stripe webhook testing
- `README.md` - This documentation

### Mock Services

The test setup includes comprehensive mocks for all external services:

#### Supabase
- User authentication
- Database operations (credits, voices, audio_files)
- Row Level Security (RLS) policies

#### Redis (Upstash)
- GET/SET operations for audio caching
- Cache hit/miss scenarios

#### AI Services
- **Replicate API**: Voice generation with prediction handling
- **Google Generative AI**: TTS with pro/flash model fallback

#### Storage
- **Vercel Blob**: Audio file upload and storage

#### Analytics & Monitoring
- **PostHog**: Event tracking
- **Sentry**: Error logging and monitoring

#### Stripe (for webhook tests)
- **Webhook signature verification**: Using `stripe.webhooks.generateTestHeaderString()`
- **Event processing**: Checkout sessions, subscriptions, invoices, payment intents
- **Customer data syncing**: Redis/KV storage updates

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Run legacy utils tests
pnpm test:legacy
```

## Test Coverage

### Generate Voice API (`generate-voice.test.ts`)

The voice generation tests cover:

### Input Validation
- Empty request body
- Missing required parameters (text, voice)
- Text length limits (500 chars for Replicate, 1000 for Gemini)
- Invalid voice names

### Authentication & Authorization
- Unauthenticated users
- User session validation

### Credit System
- Insufficient credits scenarios
- Credit estimation and deduction
- Credit transaction logging

### Voice Generation
- Replicate API integration
- Google Gemini API integration (with fallback)
- Audio format handling (ReadableStream, buffers)
- Error handling for AI service failures

### Caching
- Redis cache hits/misses
- Hash generation consistency
- Cache invalidation

### Audio Processing
- WAV conversion
- Blob storage upload
- URL generation and caching

### Error Handling
- Network failures
- API quota limits (429 errors)
- General server errors (500s)
- Request abortion handling

### Analytics Integration
- PostHog event tracking
- Sentry error reporting

### Stripe Webhooks (`stripe-webhook.test.ts`)

The Stripe webhook tests cover:

### Signature Verification
- Missing signature header validation
- Invalid signature handling
- Valid signature verification using Stripe's official `generateTestHeaderString` method
- Authentic webhook signature generation

### Checkout Session Events
- One-time topup purchases (mode: 'payment')
  - Credit awarding
  - Transaction recording
  - Promo code handling
- Subscription checkouts (mode: 'subscription')
  - Customer data syncing to Redis
  - Initial subscription credit awards

### Stripe Admin (`stripe-admin.test.ts`)

The Stripe admin tests cover the `createOrRetrieveCustomer()` function:

#### Happy Path
- Retrieve existing customer by Stripe ID with correct metadata
- Find customer by supabaseUUID metadata when not found by ID
- Find customer by email when not found by UUID or existing Stripe ID
- Create new customer when none exists

#### Metadata Handling
- Update metadata when supabaseUUID is missing
- Update metadata when supabaseUUID differs from userId
- Preserve existing metadata when updating
- Handle null or missing metadata

#### Error Handling
- Customer retrieval errors with graceful fallback
- Metadata update failures with Sentry logging
- Deleted customer handling
- API rate limiting and connection errors
- Database update errors in Supabase

#### Multiple Customers Handling
- Use first customer when multiple found by UUID
- Use first customer when multiple found by email
- Log warning messages for duplicate customers
- Handle edge cases with empty customer lists

#### Database Updates
- Update stripe_id in profiles table
- Handle database connection failures
- Ensure proper Supabase query chaining

#### Edge Cases
- Handle customer with null metadata
- Handle undefined existingStripeId parameter
- Handle null existingStripeId parameter
- Handle empty customer search results
- Handle special characters in email addresses

#### Logging and Monitoring
- Log info messages when creating new customers
- Capture warning messages for multiple customers
- Send error context to Sentry with full metadata

## Mock Setup for Stripe Admin Tests

### Overview
The `stripe-admin.test.ts` file uses Vitest with comprehensive mocking for Stripe, Supabase, and Sentry. All external API calls are mocked to ensure tests are fast, reliable, and don't depend on external services.

### Stripe Mock Setup

```typescript
vi.mock('@/lib/stripe/stripe-admin', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/stripe/stripe-admin')
  >('@/lib/stripe/stripe-admin');

  return {
    ...actual,
    stripe: {
      customers: {
        retrieve: vi.fn(),      // Fetch existing customer by ID
        search: vi.fn(),        // Search customers by metadata or other criteria
        list: vi.fn(),          // List customers by email or other filters
        update: vi.fn(),        // Update customer properties (e.g., metadata)
        create: vi.fn(),        // Create new customer
      },
    },
  };
});
```

Each mocked method returns a Vitest spy function (`vi.fn()`) that you can:
- Control the return value with `.mockResolvedValue()`
- Simulate errors with `.mockRejectedValue()`
- Verify it was called with `.toHaveBeenCalledWith()`

### Supabase Mock Setup

```typescript
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
```

In each test, configure the mock client:

```typescript
beforeEach(() => {
  mockSupabase = {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  };
  vi.mocked(createClient).mockResolvedValue(mockSupabase);
});
```

This allows testing the Supabase query chain:
```typescript
await supabase
  .from('profiles')
  .update({ stripe_id: customerId })
  .eq('id', userId);
```

### Sentry Mock Setup

```typescript
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
```

This allows verifying error handling:

```typescript
expect(Sentry.captureException).toHaveBeenCalledWith(
  error,
  expect.objectContaining({
    level: 'error',
    extra: { customerId, email, userId },
  }),
);
```

### Common Mock Patterns

#### Mocking Successful Customer Retrieval

```typescript
const customer: Stripe.Customer = {
  id: 'cus_123',
  object: 'customer',
  metadata: { supabaseUUID: userId },
  email: 'test@example.com',
} as Stripe.Customer;

vi.mocked(stripe.customers.retrieve).mockResolvedValue(customer);
```

#### Mocking Customer Search Results

```typescript
vi.mocked(stripe.customers.search).mockResolvedValue({
  object: 'search_result',
  data: [customer1, customer2],
  has_more: false,
  url: '',
});
```

#### Mocking API Errors

```typescript
const error = new Error('API Rate Limit Exceeded');
vi.mocked(stripe.customers.retrieve).mockRejectedValue(error);
```

#### Mocking Empty Results

```typescript
vi.mocked(stripe.customers.search).mockResolvedValue({
  object: 'search_result',
  data: [],
  has_more: false,
  url: '',
});
```

### Test Structure Template

```typescript
describe('Feature or Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks before each test
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up after each test
  });

  it('should do something when condition is met', async () => {
    // Arrange: Set up mocks
    vi.mocked(stripe.customers.retrieve).mockResolvedValue(customer);

    // Act: Call the function
    const result = await createOrRetrieveCustomer(userId, email, stripeId);

    // Assert: Verify behavior
    expect(result).toBe(stripeId);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith(stripeId);
  });
});
```

### Verification Patterns

#### Verify Mock Was Called

```typescript
expect(stripe.customers.retrieve).toHaveBeenCalledWith(customerId);
```

#### Verify Mock Was NOT Called

```typescript
expect(stripe.customers.search).not.toHaveBeenCalled();
```

#### Verify Call Count

```typescript
expect(stripe.customers.create).toHaveBeenCalledTimes(1);
```

#### Verify Called With Partial Match

```typescript
expect(stripe.customers.update).toHaveBeenCalledWith(
  customerId,
  expect.objectContaining({
    metadata: expect.objectContaining({
      supabaseUUID: userId,
    }),
  }),
);
```

#### Verify Sentry Logging

```typescript
expect(Sentry.logger.info).toHaveBeenCalledWith(
  'Created new Stripe customer',
  expect.objectContaining({
    customerId: 'cus_123',
    email: 'test@example.com',
    userId: 'user_123',
  }),
);
```

## Mock Data

The test setup provides realistic mock data for:

- User profiles and authentication
- Voice models (Replicate and Gemini voices)
- Credit balances and transactions
- Audio generation responses
- Cached audio URLs

## Audio Buffer Testing

Special attention is given to testing audio buffer handling:

- Mock ReadableStream for Replicate responses
- Base64 encoded mock audio data for Gemini
- WAV conversion testing
- Blob storage integration

## Stripe Testing Best Practices

### Using Official Stripe Test Utilities

Instead of manually mocking webhook signatures, we use Stripe's built-in testing helper:

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2025-02-24.acacia',
});

// Generate valid test signature
const signature = stripe.webhooks.generateTestHeaderString({
  payload: JSON.stringify(event),
  secret: 'whsec_test_secret',
});
```

**Benefits:**
- ✅ Official Stripe-maintained method
- ✅ Realistic signature validation
- ✅ Accurate webhook secret matching
- ✅ No need to mock `constructEvent` internals
- ✅ Future-proof against Stripe SDK changes

### Example Usage

```typescript
it('should process webhook with valid signature', async () => {
  const event = {
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    data: { object: checkoutSession },
    // ... other event properties
  };

  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });

  const request = {
    text: async () => payload,
    headers: {
      get: (name) => name === 'Stripe-Signature' ? signature : null,
    },
  };

  const response = await POST(request);
  expect(response.status).toBe(200);
});
```

## Environment Variables

All required environment variables are mocked in `setup.ts`:
- Supabase configuration
- AI service API keys
- Redis connection details
- Blob storage tokens
- Stripe API keys and webhook secrets

## Adding New Tests

When adding new tests:

1. Follow the existing test structure with descriptive `describe` blocks
2. Use appropriate MSW handlers for external service mocking
3. Test both success and error scenarios
4. Include edge cases and boundary conditions
5. Verify proper cleanup and resource management

## Performance Considerations

The tests are designed to be fast and reliable:
- All external services are mocked
- No real network requests
- Minimal test data setup
- Parallel test execution support

## CI/CD Integration

These tests are designed to work in CI/CD environments:
- No external dependencies (all services mocked)
- Deterministic mock responses
- Comprehensive error scenario coverage
- Fast execution times
- Uses official Stripe testing utilities for reliability

### GitHub Actions

The project includes automated CI/CD workflows in `.github/workflows/`:

#### `tests.yml` - Automated Test Runner

Runs automatically on every PR and commit to `main`/`develop` branches:
## Additional Resources

### Documentation
- `CLAUDE.md` - Project-wide guidelines and architecture
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Stripe Webhook Testing](https://stripe.com/docs/webhooks/test)
- [MSW Documentation](https://mswjs.io/)

### Reference Implementations
- `generate-voice.test.ts` - Example of comprehensive API route testing with MSW
- `stripe-webhook.test.ts` - Stripe webhook testing with official signature generation
- `setup.ts` - Centralized mock configuration for all tests

### Workflow Files
- `.github/workflows/tests.yml` - Main test automation workflow
