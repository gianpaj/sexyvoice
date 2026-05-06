import { describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/estimate-credits/route';
import * as queries from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { mockCountTokens } from './setup';

describe('Estimate Credits API Route', () => {
  it('returns 400 when request body is null', async () => {
    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      body: null,
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Request body is empty');
  });

  it('returns 400 when required parameters are missing', async () => {
    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Missing required parameters');
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never);

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hello world', voice: 'kore' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('User not found');
  });

  it('returns 404 when voice is not found', async () => {
    vi.mocked(queries.getVoiceIdByName).mockResolvedValueOnce(null as any);

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hello world', voice: 'unknown' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('Voice not found');
  });

  it('returns 400 when the voice model is not supported for estimation', async () => {
    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe(
      'Credit estimation currently supports only gpro and grok voices',
    );
  });

  it('returns tokens and credits for gpro voices', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValueOnce(true);
    mockCountTokens.mockResolvedValueOnce({ totalTokens: 360 });

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        styleVariant: 'emotion_intensity high',
        text: 'Hello world',
        voice: 'kore',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tokens).toBe(384);
    expect(json.estimatedCredits).toBe(423);
    expect(mockCountTokens).toHaveBeenCalledOnce();
  });

  it('returns estimated credits for grok (xai) voices', async () => {
    mockCountTokens.mockClear();

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hello world', voice: 'eve' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.estimatedCredits).toBe(100);
    expect(json.tokens).toBeUndefined();
    expect(mockCountTokens).not.toHaveBeenCalled();
  });

  it('returns 400 when gpro text exceeds character limit', async () => {
    // Free users have a 500 char limit (hasUserPaid defaults to false in tests)
    const excessiveText = 'a'.repeat(501);

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: excessiveText, voice: 'kore' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('Text exceeds the maximum length');
    expect(json.error).toContain('500 characters');
  });

  it('returns 400 when grok text exceeds character limit', async () => {
    const excessiveText = 'a'.repeat(501);

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: excessiveText, voice: 'eve' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('Text exceeds the maximum length');
    expect(json.error).toContain('500 characters');
  });

  it('returns 400 when request body has malformed JSON', async () => {
    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: 'not valid json {]',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid JSON in request body');
  });
});
