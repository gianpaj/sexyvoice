import { EventEmitter } from 'node:events';
import { initializeLogger } from '@livekit/agents';
import { TTS } from '@livekit/agents-plugin-inworld';
import { expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({
  requests: [] as Record<string, unknown>[],
}));

vi.mock('ws', () => ({
  WebSocket: class extends EventEmitter {
    static OPEN = 1;
    readyState = 1;

    constructor() {
      super();
      queueMicrotask(() => this.emit('open'));
    }

    close() {
      this.emit('close', 1000);
    }

    send(body: string, done: () => void) {
      sent.requests.push(JSON.parse(body));
      done();
    }
  },
}));

initializeLogger({ pretty: false, level: 'fatal' });

it('streams with the supplied Inworld workspace voice and cancels the same context', async () => {
  const tts = new TTS({
    apiKey: 'synthetic-key',
    model: 'inworld-tts-2',
    voice: 'workspace__clone',
    deliveryMode: 'BALANCED',
  });
  const stream = tts.stream();
  try {
    stream.pushText('A short reply.');
    await vi.waitFor(() =>
      expect(sent.requests).toEqual([
        expect.objectContaining({
          create: expect.objectContaining({
            voiceId: 'workspace__clone',
            modelId: 'inworld-tts-2',
            deliveryMode: 'BALANCED',
          }),
        }),
        expect.objectContaining({ send_text: { text: 'A short reply.' } }),
      ]),
    );

    const contextId = sent.requests[0].contextId;
    expect(contextId).toEqual(expect.any(String));
    expect(sent.requests[1].contextId).toBe(contextId);

    stream.close();
    await vi.waitFor(() =>
      expect(sent.requests).toContainEqual({ cancel_context: {}, contextId }),
    );
  } finally {
    stream.close();
    await tts.close();
  }
});
