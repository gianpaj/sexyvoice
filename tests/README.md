# API Route Testing Setup

This directory contains comprehensive tests for the SexyVoice.ai API routes, focusing on the `generate-voice` endpoint.

## Setup Requirements

Before running the tests, install the required dependencies:

```bash
pnpm add -D vitest @vitest/ui msw @types/supertest supertest @vitest/coverage-v8
```

## Test Structure

### Files:
- `setup.ts` - Test environment setup with MSW mocking
- `generate-voice.test.ts` - Comprehensive tests for the generate voice API route
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

The tests cover:

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

## Environment Variables

All required environment variables are mocked in `setup.ts`:
- Supabase configuration
- AI service API keys
- Redis connection details
- Blob storage tokens

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
- No external dependencies
- Deterministic mock responses
- Comprehensive error scenario coverage
- Fast execution times