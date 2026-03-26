import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/demo-tts/route';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  mockCookieGet,
  mockRatelimitLimit,
  mockRedisSet,
  mockUploadFileToR2,
  mockVerifySolution,
} from './setup';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/demo-tts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

describe('/api/demo-tts', () => {
  beforeEach(() => {
    process.env.ALTCHA_HMAC_KEY = 'test-altcha-key';
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    mockCookieGet.mockReset().mockReturnValue(undefined);
    mockVerifySolution.mockReset().mockResolvedValue(true);
    mockRedisSet.mockReset().mockResolvedValue('OK');
    mockRatelimitLimit.mockReset().mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      reset: Date.now() + 60_000,
    });
    mockUploadFileToR2.mockClear();

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'voice-1', name: 'poe' },
          error: null,
        }),
      })),
      rpc: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for missing required fields', async () => {
    const response = await POST(
      makeRequest({ text: '', voiceId: '', altchaPayload: '' }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'missing_fields' });
  });

  it('returns 400 when text exceeds the demo limit', async () => {
    const response = await POST(
      makeRequest({
        text: 'x'.repeat(201),
        voiceId: 'voice-1',
        altchaPayload: 'payload',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'text_too_long' });
  });

  it('returns invalid_captcha when Altcha verification fails', async () => {
    mockVerifySolution.mockResolvedValueOnce(false);

    const response = await POST(
      makeRequest({
        text: 'Hello world',
        voiceId: 'voice-1',
        altchaPayload: 'payload',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'invalid_captcha' });
  });

  it('returns invalid_captcha when a verified Altcha payload is replayed', async () => {
    mockRedisSet.mockResolvedValueOnce(null);

    const response = await POST(
      makeRequest({
        text: 'Hello world',
        voiceId: 'voice-1',
        altchaPayload: 'payload',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'invalid_captcha' });
  });

  it('returns 429 when the demo quota is exhausted', async () => {
    mockRatelimitLimit.mockResolvedValue({
      success: false,
      limit: 3,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await POST(
      makeRequest({
        text: 'Hello world',
        voiceId: 'voice-1',
        altchaPayload: 'payload',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json).toEqual({ error: 'limit_reached', remaining: 0 });
  });

  it('sets a session cookie for a new browser session on success', async () => {
    const response = await POST(
      makeRequest({
        text: 'Hello world',
        voiceId: 'voice-1',
        altchaPayload: 'payload',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      audioUrl: 'https://files.sexyvoice.ai/demo-audio/poe-1700000000000.wav',
      remaining: 2,
    });
    expect(response.headers.get('set-cookie')).toContain(
      'demo_session_id=test-demo-session-id',
    );
  });
});
