# API Route Testing Setup

This directory contains comprehensive tests for the SexyVoice.ai API routes, including the `generate-voice` endpoint and `stripe-webhook` handler.

## Setup Requirements

Before running the tests, install the required dependencies:

```bash
pnpm add -D vitest @vitest/ui msw @types/supertest supertest @vitest/coverage-v8
```

## Test Structure

### Files:
- `setup.ts` - Test environment setup with MSW mocking
- `generate-voice.test.ts` - Comprehensive tests for the generate voice API route
- `clone-voice.test.ts` - Comprehensive tests for the voice cloning API route
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
- **fal.ai**: Voice cloning with chatterbox-tts model

#### Storage
- **Vercel Blob**: Audio file upload and storage

#### Analytics & Monitoring
- **PostHog**: Event tracking
- **Sentry**: Error logging and monitoring

#### Background Jobs
- **Inngest**: Scheduled cleanup tasks for uploaded audio files

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

---

### Clone Voice API (`clone-voice.test.ts`)

The voice cloning tests cover:

### Input Validation
- Content-Type verification (multipart/form-data required)
- Missing required parameters (text, audio file)
- Text length limits (500 characters max)
- File type validation (MP3, WAV, OGG, M4A only)
- File size limits (10MB max)
- Audio duration validation (5 seconds minimum, 5 minutes maximum)
- Audio duration detection failures

### Authentication & Authorization
- Unauthenticated users
- User session validation

### Credit System
- Insufficient credits scenarios
- Credit estimation for voice cloning (higher cost than regular generation)
- Credit deduction after successful cloning
- Credit transaction logging

### Voice Cloning
- fal.ai API integration (chatterbox-tts model)
- Audio file upload and processing
- Generated audio storage
- Request parameter handling (cfg_weight, temperature, exaggeration)
- Error handling for AI service failures

### Caching
- Redis cache hits/misses for generated audio
- Hash generation based on text + audio filename
- Cache invalidation
- Reuse of existing uploaded audio files (via blob.head check)

### Audio File Management
- Audio file upload to Vercel Blob storage
- Input audio file caching and reuse
- Output audio file generation and storage
- Filename sanitization (special characters, unicode)

### Background Tasks
- Inngest cleanup scheduling
- Audio file deletion after 1 hour
- Event payload validation

### Error Handling
- Network failures
- API errors from fal.ai
- Blob storage failures
- General server errors (500s)
- Request abortion handling

### Analytics Integration
- PostHog event tracking
- Sentry error reporting
- Event tracking for cached results (0 credits)

### Audio Format Support
- MP3 file handling
- WAV file handling
- OGG file handling
- M4A file handling

---

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
