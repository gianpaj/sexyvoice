import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/clone/route';
import {
  getCreditsAdmin,
  insertUsageEvent,
  reduceCreditsAdmin,
  saveAudioFileAdmin,
} from '@/lib/supabase/queries';
import {
  flushPromises,
  mockFalSubscribe,
  mockMistralSpeechComplete,
  mockParseBuffer,
  mockRatelimitLimit,
  mockReplicateRun,
  mockUploadFileToR2,
} from './setup';

const TEST_API_KEY = 'sk_live_Abc123Def456Ghi789Jkl012Mno345Pq';
const TEST_AUTH_HEADER = `Bearer ${TEST_API_KEY}`;

// Build a minimal-but-valid WAV buffer (RIFF/WAVE with fmt + data chunks).
const createWavBase64 = (dataSize = 1024): string => {
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(44_100, 24);
  buffer.writeUInt32LE(88_200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  return buffer.toString('base64');
};

const cloneRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/v1/clone', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: TEST_AUTH_HEADER,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('/api/v1/clone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default reference-audio duration valid for both Voxtral (min 3s) and the
    // Replicate fallback (min 10s).
    mockParseBuffer.mockResolvedValue({ format: { duration: 12 } } as never);
  });

  it('returns 401 when API key is missing', async () => {
    const request = new Request('http://localhost/api/v1/clone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: 'Hello world',
        reference_audio: createWavBase64(),
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe('invalid_api_key');
    expect(response.headers.get('request-id')).toBeTruthy();
  });

  it('returns 401 when API key is malformed', async () => {
    const request = cloneRequest(
      { input: 'Hello', reference_audio: createWavBase64() },
      { authorization: 'Bearer not-a-valid-key' },
    );

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe('invalid_api_key');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockRatelimitLimit.mockResolvedValueOnce({
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await POST(
      cloneRequest({ input: 'Hi', reference_audio: createWavBase64() }),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.code).toBe('rate_limit_exceeded');
    expect(response.headers.get('x-ratelimit-remaining-requests')).toBe('0');
  });

  it('returns 400 when neither reference_audio nor reference_audio_url is provided', async () => {
    const response = await POST(cloneRequest({ input: 'Hello world' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('invalid_request');
  });

  it('returns 400 when both reference inputs are provided', async () => {
    const response = await POST(
      cloneRequest({
        input: 'Hello world',
        reference_audio: createWavBase64(),
        reference_audio_url: 'https://example.com/ref.wav',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('invalid_request');
  });

  it('returns 400 when input is empty', async () => {
    const response = await POST(
      cloneRequest({ input: '', reference_audio: createWavBase64() }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.type).toBe('invalid_request_error');
  });

  it('returns 400 input_too_long when free-tier Voxtral text exceeds the limit', async () => {
    const response = await POST(
      cloneRequest({
        input: 'a'.repeat(1001),
        locale: 'en',
        reference_audio: createWavBase64(),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('input_too_long');
    expect(json.error.param).toBe('input');
  });

  it('returns 400 for an unsupported locale', async () => {
    const response = await POST(
      cloneRequest({
        input: 'Hello world',
        locale: 'xyz',
        reference_audio: createWavBase64(),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('unsupported_locale');
    expect(json.error.param).toBe('locale');
  });

  it('returns 402 when credits are insufficient', async () => {
    vi.mocked(getCreditsAdmin).mockResolvedValueOnce(1);

    const response = await POST(
      cloneRequest({
        input: 'Hello world this is a long enough sentence',
        locale: 'en',
        reference_audio: createWavBase64(),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(402);
    expect(json.error.code).toBe('insufficient_credits');
  });

  it('clones a voice with Mistral Voxtral for an en locale (happy path)', async () => {
    const response = await POST(
      cloneRequest({
        input: 'Hello from the clone API',
        locale: 'en',
        reference_audio: createWavBase64(),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toContain('files.sexyvoice.ai');
    expect(json.credits_used).toBeGreaterThan(0);
    expect(json.credits_remaining).toBeDefined();
    expect(json.usage.model).toBe('voxtral-mini-tts-2603');
    expect(json.usage.input_characters).toBe('Hello from the clone API'.length);

    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenCalledWith({
      userId: 'test-user-id',
      amount: json.credits_used,
    });
    expect(vi.mocked(saveAudioFileAdmin)).toHaveBeenCalled();
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'api_voice_cloning',
        apiKeyId: 'test-api-key-id',
        unit: 'operation',
        quantity: 1,
      }),
    );
  });

  it('clones a voice with Replicate for a non-Voxtral locale', async () => {
    const response = await POST(
      cloneRequest({
        input: 'こんにちは',
        locale: 'ja',
        reference_audio: createWavBase64(),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toContain('files.sexyvoice.ai');
    expect(mockReplicateRun).toHaveBeenCalled();
    expect(mockMistralSpeechComplete).not.toHaveBeenCalled();
    // Reference audio upload + generated output upload.
    expect(mockUploadFileToR2).toHaveBeenCalledWith(
      expect.stringContaining('clone-voice-input-api/'),
      expect.any(Buffer),
      expect.any(String),
      'test-speech-bucket',
      undefined,
    );
  });

  it('bills a second usage event when reference audio enhancement is enabled', async () => {
    const response = await POST(
      cloneRequest({
        input: 'Hello world',
        locale: 'en',
        reference_audio: createWavBase64(),
        enhance_reference_audio: true,
      }),
    );
    const json = await response.json();
    await flushPromises();

    expect(response.status).toBe(200);
    expect(json.url).toContain('files.sexyvoice.ai');
    // Base clone credits + 120 enhancement credits (12s * 10/sec).
    expect(json.credits_used).toBeGreaterThan(120);
    expect(mockFalSubscribe).toHaveBeenCalled();
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(insertUsageEvent)).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceType: 'audio_processing',
        unit: 'secs',
        creditsUsed: 120, // 12s * 10 credits/sec
      }),
    );
  });

  it('returns 422 when Mistral blocks the request via guardrail', async () => {
    const guardrailBody = {
      object: 'error',
      message: 'Request blocked by guardrail policy',
      type: 'guardrail_violation',
      code: '1920',
      raw_status_code: 403,
    };
    mockMistralSpeechComplete.mockRejectedValueOnce(
      Object.assign(new Error('API error occurred: Status 403'), {
        body: JSON.stringify(guardrailBody),
        name: 'SDKError',
        statusCode: 403,
      }),
    );

    const response = await POST(
      cloneRequest({
        input: 'blocked text',
        locale: 'en',
        reference_audio: createWavBase64(),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error.code).toBe('content_policy_violation');
    expect(vi.mocked(reduceCreditsAdmin)).not.toHaveBeenCalled();
  });

  it('returns 503 when the Replicate provider is unavailable', async () => {
    mockReplicateRun.mockResolvedValueOnce({ error: 'API quota exceeded' });

    const response = await POST(
      cloneRequest({
        input: 'こんにちは',
        locale: 'ja',
        reference_audio: createWavBase64(),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.code).toBe('provider_unavailable');
  });

  it('returns 400 for malformed JSON payloads', async () => {
    const response = await POST(cloneRequest('{bad-json'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe('Invalid JSON payload');
  });
});
