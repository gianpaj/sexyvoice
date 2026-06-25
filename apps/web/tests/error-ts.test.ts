import { describe, expect, it } from 'vitest';

import { APIError, APIErrorResponse } from '@/lib/error-ts';

describe('APIErrorResponse', () => {
  it('returns a JSON response with the given status code', async () => {
    const response = APIErrorResponse('Insufficient credits', 402);

    expect(response.status).toBe(402);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('produces a consistent error body shape', async () => {
    const response = APIErrorResponse('Insufficient credits', 402);
    const body = await response.json();

    expect(body).toMatchObject({
      // `error` mirrors the raw message for backward compatibility with
      // clients that read `data.error`.
      error: 'Insufficient credits',
      // `message` includes the status suffix.
      message: 'Insufficient credits (402)',
      status: 402,
      serverMessage: 'Insufficient credits',
      retryAfter: null,
    });
  });

  it('keeps `error` equal to the raw message (no status suffix)', async () => {
    const body = await APIErrorResponse('Not found', 404).json();

    expect(body.error).toBe('Not found');
    expect(body.message).toBe('Not found (404)');
  });

  it('merges extra fields into the body', async () => {
    const body = await APIErrorResponse('Invalid request body', 400, {
      details: 'text: too long',
    }).json();

    expect(body.error).toBe('Invalid request body');
    expect(body.status).toBe(400);
    expect(body.details).toBe('text: too long');
  });

  it('attaches response headers when provided', () => {
    const headers = new Headers({ 'X-RateLimit-Remaining-Requests': '0' });
    const response = APIErrorResponse(
      'Too many requests',
      429,
      undefined,
      headers,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Remaining-Requests')).toBe('0');
  });

  it('APIError exposes the same fields when constructed directly', () => {
    const error = new APIError('Boom', new Response('Boom', { status: 500 }), {
      details: 'stack',
    });

    expect(error.error).toBe('Boom');
    expect(error.message).toBe('Boom (500)');
    expect(error.serverMessage).toBe('Boom');
    expect(error.status).toBe(500);
    expect(error.details).toBe('stack');
  });
});
