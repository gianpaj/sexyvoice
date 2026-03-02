import { describe, expect, it, vi } from 'vitest';

import { GET as getModels } from '@/app/api/v1/models/route';
import { GET as getOpenApi } from '@/app/api/v1/openapi/route';
import { GET as getVoices } from '@/app/api/v1/voices/route';
import { createClient } from '@/lib/supabase/server';

describe('/api/v1 metadata endpoints', () => {
  it('returns model catalog', async () => {
    const request = new Request('http://localhost/api/v1/models', {
      method: 'GET',
      headers: { 'x-api-key': 'test-external-api-key' },
    });

    const response = await getModels(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].id).toBe('gpro');
    expect(response.headers.get('X-RateLimit-Limit-Requests')).toBe('60');
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
                'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
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
      headers: { 'x-api-key': 'test-external-api-key' },
    });

    const response = await getVoices(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].model).toBe('gpro');
    expect(json.data[1].model).toBe('kokoro');
  });

  it('returns OpenAPI 3.1.0 document with speech path', async () => {
    const request = new Request('http://localhost/api/v1/openapi', {
      method: 'GET',
      headers: { 'x-api-key': 'test-external-api-key' },
    });

    const response = await getOpenApi(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.openapi).toBe('3.1.0');
    expect(json.paths['/api/v1/speech']).toBeDefined();
    expect(
      json.paths['/api/v1/speech'].post.requestBody.content['application/json']
        .examples.basic.value.model,
    ).toBe('gpro');
  });
});
