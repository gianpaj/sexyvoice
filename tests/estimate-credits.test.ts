import { describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/estimate-credits/route';
import { createClient } from '@/lib/supabase/server';
import * as queries from '@/lib/supabase/queries';
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
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never);

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('User not found');
  });

  it('returns 404 when voice is not found', async () => {
    // @ts-expect-error
    vi.mocked(queries.getVoiceIdByName).mockResolvedValueOnce(null);

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

  it('returns 400 when the voice model is not gpro', async () => {
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
    expect(json.error).toBe('Credit estimation currently supports only gpro voices');
  });

  it('returns tokens and credits for gpro voices', async () => {
    mockCountTokens.mockResolvedValueOnce({ totalTokens: 456 });

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hello world', voice: 'poe', styleVariant: 'warm' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tokens).toBe(456);
    expect(json.credits).toBeGreaterThan(0);
    expect(mockCountTokens).toHaveBeenCalledWith({
      model: 'gemini-2.0-flash',
      contents: [{ parts: [{ text: 'warm: Hello world' }], role: 'user' }],
    });
  });

  it('returns 400 when text exceeds character limit', async () => {
    // Create text that exceeds the limit (gpro max is 1000 chars)
    const excessiveText = 'a'.repeat(1001);

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: excessiveText, voice: 'poe' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('Text exceeds the maximum length');
    expect(json.error).toContain('1000 characters');
  });

  it('returns 400 when text exceeds character limit with styleVariant', async () => {
    // Create text that exceeds the limit when combined with styleVariant
    // "warm: " (6 chars) + 995 chars = 1001 chars (exceeds 1000 limit)
    const textToPush = 'a'.repeat(995);
    const styleVariant = 'warm';

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: textToPush,
        voice: 'poe',
        styleVariant: styleVariant,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('Text exceeds the maximum length');
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
