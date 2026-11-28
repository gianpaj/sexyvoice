import { EventEmitter } from 'node:events';
import { initializeLogger } from '@livekit/agents';
import { STT } from '@livekit/agents-plugin-xai';
import { describe, expect, it, vi } from 'vitest';

const opened = vi.hoisted(() => ({ urls: [] as URL[] }));
vi.mock('ws', () => ({
  WebSocket: class extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    constructor(url: URL) {
      super();
      opened.urls.push(url);
      queueMicrotask(() => this.emit('open'));
    }
    close() {
      this.emit('close', 1000);
    }
    send() {
      /* No audio is submitted in this connection-contract test. */
    }
  },
}));
initializeLogger({ pretty: false, level: 'fatal' });
describe('xAI STT model pin', () => {
  it.each(['grok-voice-transcribe-2.0', 'test-future-model'])(
    'sends %s in the actual WebSocket URL',
    async (model) => {
      opened.urls = [];
      const stt = new STT({ apiKey: 'synthetic-test-key', model });
      const stream = stt.stream();
      const reading = stream.next();
      await vi.waitFor(() => expect(opened.urls).toHaveLength(1));
      expect(opened.urls[0].origin).toBe('wss://api.x.ai');
      expect(opened.urls[0].pathname).toBe('/v1/stt');
      expect(opened.urls[0].searchParams.get('model')).toBe(model);
      stream.close();
      await reading;
      await stt.close();
    },
  );
});
