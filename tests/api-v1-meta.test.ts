import { describe, expect, it, vi } from 'vitest';

import { GET as getModels } from '@/app/api/v1/models/route';
import { GET as getOpenApi } from '@/app/api/v1/openapi/route';
import { GET as getVoices } from '@/app/api/v1/voices/route';
import { createClient } from '@/lib/supabase/server';

const TEST_API_KEY = 'sk_live_Abc123Def456Ghi789Jkl012Mno345Pq';
const TEST_AUTH_HEADER = `Bearer ${TEST_API_KEY}`;

describe('/api/v1 metadata endpoints', () => {
  it('returns model catalog', async () => {
    const request = new Request('http://localhost/api/v1/models', {
      method: 'GET',
      headers: { authorization: TEST_AUTH_HEADER },
    });

    const response = await getModels(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(3);
    expect(json.data[0].id).toBe('gpro');
    expect(response.headers.get('X-RateLimit-Limit-Requests')).toBe('60');
    expect(response.headers.get('request-id')).toBeTruthy();
  });

  it('returns voices list', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'voice-poe-id',
              name: 'poe',
              language: 'en',
              model: 'gpro',
              feature: 'tts',
              is_public: true,
            },
            {
              id: 'voice-tara-id',
              name: 'tara',
              language: 'en',
              model:
                'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
              feature: 'tts',
              is_public: true,
            },
          ],
          error: null,
        }),
      })),
    } as never);

    const request = new Request('http://localhost/api/v1/voices', {
      method: 'GET',
      headers: { authorization: TEST_AUTH_HEADER },
    });

    const response = await getVoices(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].model).toBe('gpro');
    expect(json.data[1].model).toBe('orpheus');
    expect(response.headers.get('request-id')).toBeTruthy();
  });

  it('returns OpenAPI 3.1.0 document with speech path', async () => {
    const response = await getOpenApi();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.openapi).toBe('3.1.0');
    expect(json.paths['/api/v1/speech']).toBeDefined();
    expect(json.paths['/api/v1/billing']).toBeDefined();
    expect(
      json.paths['/api/v1/speech'].post.requestBody.content['application/json']
        .examples.basic.value.model,
    ).toBe('gpro');
    const speechSchema = JSON.stringify(
      json.paths['/api/v1/speech'].post.requestBody.content['application/json']
        .schema,
    );
    expect(speechSchema).not.toContain('"speed"');
  });
});
