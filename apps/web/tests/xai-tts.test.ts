import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { GROK_LANGUAGES } from '@/lib/tts/models';
import { generateXaiTts } from '@/lib/tts/xai';
import { server } from './setup';

async function xaiRequestBody(input: { language: string; speed?: number }) {
  let body: Record<string, unknown> = {};
  server.use(
    http.post('https://api.x.ai/v1/tts', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    }),
  );
  await generateXaiTts({ text: 'Hello', voiceId: 'eve', ...input });
  return body;
}

describe('generateXaiTts', () => {
  it.each(GROK_LANGUAGES)(
    'sends the offered language %s as is',
    async (language) => {
      expect((await xaiRequestBody({ language })).language).toBe(language);
    },
  );

  it.each([
    ['ar', 'ar-SA'],
    ['es', 'es-ES'],
    ['pt', 'pt-BR'],
    ['en-US', 'en'],
    ['fr-CA', 'fr'],
    ['multiple', 'auto'],
    ['', 'auto'],
    ['xx-YY', 'auto'],
  ])('sends %s as %s', async (language, expected) => {
    expect((await xaiRequestBody({ language })).language).toBe(expected);
  });

  it('sends a speed only when one is set', async () => {
    expect(await xaiRequestBody({ language: 'en', speed: 1.2 })).toMatchObject({
      speed: 1.2,
    });
    expect(await xaiRequestBody({ language: 'en' })).not.toHaveProperty(
      'speed',
    );
  });
});
