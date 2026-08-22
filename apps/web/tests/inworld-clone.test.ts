import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { cloneVoiceWithInworld, InworldError } from '@/lib/clone/inworld';
import { server } from './setup';

describe('cloneVoiceWithInworld', () => {
  it('deletes the minted voice when synthesis fails', async () => {
    let deletedVoiceId: string | undefined;

    server.use(
      http.post('https://api.inworld.ai/voices/v1/voices:clone', () =>
        HttpResponse.json({
          voice: { voiceId: 'cleanup-voice-id' },
        }),
      ),
      http.post('https://api.inworld.ai/tts/v1/voice', () =>
        HttpResponse.text('synthesis failed', { status: 503 }),
      ),
      http.delete(
        'https://api.inworld.ai/voices/v1/voices/:voiceId',
        ({ params }) => {
          deletedVoiceId = String(params.voiceId);
          return HttpResponse.json({});
        },
      ),
    );

    await expect(
      cloneVoiceWithInworld({
        displayName: 'Test voice',
        locale: 'en',
        referenceAudioBuffer: Buffer.from('reference audio'),
        text: 'Hello world',
        userId: 'test-user-id',
      }),
    ).rejects.toBeInstanceOf(InworldError);

    expect(deletedVoiceId).toBe('cleanup-voice-id');
  });
});
