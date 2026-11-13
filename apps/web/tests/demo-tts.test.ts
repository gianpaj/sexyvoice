import { webcrypto } from 'node:crypto';
import type { Payload } from 'altcha-lib/types';
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

const TEST_PAYLOAD = Buffer.from(
  JSON.stringify({
    algorithm: 'SHA-256',
    challenge: 'test-challenge',
    number: 7,
    salt: 'test-salt',
    signature: 'test-signature',
  }),
).toString('base64');

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
    vi.unstubAllGlobals();
  });

  it('returns 400 for missing required fields', async () => {
    const response = await POST(
      makeRequest({ text: '', voiceId: '', altchaPayload: '' }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: 'missing_fields' });
  });

  it('returns 400 when text exceeds the demo limit', async () => {
    const response = await POST(
      makeRequest({
        text: 'x'.repeat(201),
        voiceId: 'voice-1',
        altchaPayload: TEST_PAYLOAD,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: 'text_too_long' });
  });

  it('returns invalid_captcha when Altcha verification fails', async () => {
    mockVerifySolution.mockResolvedValueOnce(false);

    const response = await POST(
      makeRequest({
        text: 'Hello world',
        voiceId: 'voice-1',
        altchaPayload: TEST_PAYLOAD,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: 'invalid_captcha' });
  });

  it('returns invalid_captcha when a verified Altcha payload is replayed', async () => {
    mockRedisSet.mockResolvedValueOnce(null);

    const response = await POST(
      makeRequest({
        text: 'Hello world',
        voiceId: 'voice-1',
        altchaPayload: TEST_PAYLOAD,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: 'invalid_captcha' });
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
        altchaPayload: TEST_PAYLOAD,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json).toMatchObject({ error: 'limit_reached', remaining: 0 });
  });

  it('sets a session cookie for a new browser session on success', async () => {
    const response = await POST(
      makeRequest({
        text: 'Hello world',
        voiceId: 'voice-1',
        altchaPayload: TEST_PAYLOAD,
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

  describe('single-use proofs with real ALTCHA verification', () => {
    let solution: Payload;
    let altcha: typeof import('altcha-lib');

    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64');
    const submit = (altchaPayload: string) =>
      POST(
        makeRequest({ text: 'Hello world', voiceId: 'voice-1', altchaPayload }),
      );

    beforeEach(async () => {
      vi.stubGlobal('crypto', webcrypto);
      altcha = await vi.importActual<typeof import('altcha-lib')>('altcha-lib');
      mockVerifySolution.mockImplementation(altcha.verifySolution);
      solution = {
        ...(await altcha.createChallenge({
          hmacKey: process.env.ALTCHA_HMAC_KEY!,
          number: 7,
          salt: 'demo-replay-test',
          expires: new Date(Date.now() + 300_000),
        })),
        number: 7,
      };
      const reservations = new Set<string>();
      mockRedisSet.mockImplementation(async (key: string) => {
        if (reservations.has(key)) return null;
        reservations.add(key);
        return 'OK';
      });
    });

    it.each([
      [
        'JSON whitespace',
        (proof: Payload) =>
          Buffer.from(JSON.stringify(proof, null, 2)).toString('base64'),
      ],
      [
        'JSON key order',
        (proof: Payload) =>
          encode(Object.fromEntries(Object.entries(proof).reverse())),
      ],
      ['Base64 whitespace', (proof: Payload) => ` \n${encode(proof)}\t`],
      [
        'numeric aliases',
        (proof: Payload) => encode({ ...proof, number: String(proof.number) }),
      ],
      [
        'salt delimiter aliases',
        (proof: Payload) => encode({ ...proof, salt: proof.salt.slice(0, -1) }),
      ],
      [
        'extra widget metadata',
        (proof: Payload) => encode({ ...proof, took: 42, test: false }),
      ],
    ])('rejects a solved proof reused with %s', async (_name, reencode) => {
      const original = encode(solution);
      const variant = reencode(solution);
      expect(variant).not.toBe(original);
      expect(
        await altcha.verifySolution(variant, process.env.ALTCHA_HMAC_KEY!),
      ).toBe(true);

      expect((await submit(original)).status).toBe(200);
      const replay = await submit(variant);

      expect(replay.status).toBe(400);
      expect(await replay.json()).toMatchObject({ error: 'invalid_captcha' });
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(1);
      expect(mockRedisSet).toHaveBeenCalledWith(expect.any(String), '1', {
        ex: 600,
        nx: true,
      });
    });

    it('rejects a Base64 proof nested inside another encoded JSON string', async () => {
      const payload = encode(solution);
      expect((await submit(payload)).status).toBe(200);

      const response = await submit(encode(payload));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'invalid_captcha' });
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(1);
    });

    it('allows a distinct signed challenge after one has been used', async () => {
      const fresh = await altcha.createChallenge({
        hmacKey: process.env.ALTCHA_HMAC_KEY!,
        number: 7,
        salt: 'fresh-demo-challenge',
        expires: new Date(Date.now() + 300_000),
      });

      expect((await submit(encode(solution))).status).toBe(200);
      expect((await submit(encode({ ...fresh, number: 7 }))).status).toBe(200);
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(2);
    });

    it('does not reserve a replay key for an invalid signature', async () => {
      const response = await submit(
        encode({ ...solution, signature: 'invalid' }),
      );

      expect(response.status).toBe(400);
      expect(mockRedisSet).not.toHaveBeenCalled();
      expect(mockUploadFileToR2).not.toHaveBeenCalled();
    });

    it.each([
      ['invalid Base64', '!'],
      ['invalid JSON', Buffer.from('{').toString('base64')],
      ['null', encode(null)],
      ['an array', encode([])],
    ])('rejects a payload containing %s', async (_name, payload) => {
      const response = await submit(payload);

      expect(response.status).toBe(400);
      expect(mockRedisSet).not.toHaveBeenCalled();
      expect(mockUploadFileToR2).not.toHaveBeenCalled();
    });

    it('rejects an expired signed proof', async () => {
      const expired = await altcha.createChallenge({
        hmacKey: process.env.ALTCHA_HMAC_KEY!,
        number: 7,
        salt: 'expired-demo-challenge',
        expires: new Date(Date.now() - 1000),
      });

      const response = await submit(encode({ ...expired, number: 7 }));

      expect(response.status).toBe(400);
      expect(mockRedisSet).not.toHaveBeenCalled();
      expect(mockUploadFileToR2).not.toHaveBeenCalled();
    });

    it('rejects the proof when Redis cannot reserve its signature', async () => {
      mockRedisSet.mockRejectedValueOnce(new Error('Redis unavailable'));

      const response = await submit(encode(solution));

      expect(response.status).toBe(400);
      expect(mockUploadFileToR2).not.toHaveBeenCalled();
    });

    it('accepts only one concurrent copy of a solved proof', async () => {
      const responses = await Promise.all([
        submit(encode(solution)),
        submit(encode({ ...solution, took: 42 })),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 400,
      ]);
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(1);
    });
  });
});
