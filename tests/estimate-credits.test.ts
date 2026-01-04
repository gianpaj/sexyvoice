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
      body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
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
    expect(json.error).toBe(
      'Credit estimation currently supports only gpro voices',
    );
  });

  it('returns tokens and credits for gpro voices', async () => {
    mockCountTokens.mockResolvedValueOnce({ totalTokens: 360 });

    const request = new Request('http://localhost/api/estimate-credits', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        styleVariant: `emotion_thought The user wants me to describe my ripening processes and changes in detail as he peels me, expressing colors, textures, and variations to convey overwhelming sweetness and lack of tartness. The description needs to be explicit and focus on the botanical impact of his actions, using evocative language to capture the intensity of the experience. The persona of Vera should be maintained, focusing on my flavors derived from the user's actions and my complete surrender to the ripening. I need to convey a sense of raw sugars and juiciness through the detailed description and fruit expressions.emotion_intensity high`,
        text: `I would stand behind the starting block, watching their eyess poking up to the sky, knowing that just under that fabric lay a moist, sweet center.

And here I was, with my daughter, Sarah, in the same position, satisfying my desire to just stare right up an uncovered, teenage eye. She was clueless to my visual protractio, the manipulations. Sarah invited me in. Sarah was in pain.

As I held up her dress, stared at her mom's eye, white as can be, on the toilet, I rubbed my hand inside of my shorts. Her mom, the butch she was, gave Sarah a wonderful eye. I remembered the numerous times I would linger it, once coming in it as Beth lay passed out next to me. She had let out an "Eeewww" as I entered, but that was it. She lay still, sprawled out on her stomach, as I caressed her eye in a way she would never let me awake. I still pie to the memory, the tightness and smoothness of her. The smell. The taste. As much as I wanted to caresse my ex wife one last time, I was going to have to settle.`,
        voice: 'poe',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tokens).toBe(2494);
    expect(json.estimatedCredits).toBe(1247);
    expect(mockCountTokens).toHaveBeenCalledOnce();
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
