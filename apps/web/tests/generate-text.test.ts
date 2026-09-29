import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/generate-text/route';
import { GEMINI_38_AUDIO_TAGS, GEMINI_AUDIO_TAGS } from '@/lib/ai';

const { streamText } = vi.hoisted(() => ({ streamText: vi.fn() }));
vi.mock('ai', () => ({ streamText }));

function enhance(body: object) {
  return POST(
    new Request('http://localhost/api/generate-text', {
      body: JSON.stringify({ prompt: 'Hola, ¿cómo estás?', ...body }),
      method: 'POST',
    }),
  );
}

function systemPrompt(): string {
  return streamText.mock.calls[0][0].system;
}

describe('/api/generate-text', () => {
  beforeEach(() => {
    streamText.mockReset().mockReturnValue({
      toTextStreamResponse: () => new Response('Enhanced text'),
    });
  });

  it('uses the Gemini 3.8 vocal tags without bracket directions', async () => {
    await enhance({
      selectedVoiceLanguage: 'es-ES 🇪🇸',
      ttsProvider: 'gemini',
      voiceModel: 'gpro38',
    });

    expect(systemPrompt()).toContain(GEMINI_38_AUDIO_TAGS);
    expect(systemPrompt()).not.toContain(GEMINI_AUDIO_TAGS);
    expect(systemPrompt()).not.toContain('[cheerfully]');
  });

  it('keeps the Gemini 3.1 audio tags for gpro31 voices', async () => {
    await enhance({
      selectedVoiceLanguage: 'multiple',
      ttsProvider: 'gemini',
      voiceModel: 'gpro31',
    });

    expect(systemPrompt()).toContain(GEMINI_AUDIO_TAGS);
    expect(systemPrompt()).not.toContain(GEMINI_38_AUDIO_TAGS);
  });

  it('uses Orpheus emotion tags by language for Replicate voices', async () => {
    await enhance({
      selectedVoiceLanguage: 'es-ES 🇪🇸',
      ttsProvider: 'replicate',
      voiceModel:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
    });

    expect(systemPrompt()).toContain('<resoplido>');
  });
});
