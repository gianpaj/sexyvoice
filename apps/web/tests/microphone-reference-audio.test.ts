import { describe, expect, it, vi } from 'vitest';

import {
  createMicrophoneReferenceAudioFile,
  isWebmAudioBlob,
} from '@/lib/clone/microphone-reference-audio';

describe('microphone reference audio', () => {
  it('detects WebM microphone blobs with codec parameters', () => {
    expect(
      isWebmAudioBlob(new Blob(['webm'], { type: 'video/webm;codecs=opus' })),
    ).toBe(true);
    expect(isWebmAudioBlob(new Blob(['wav'], { type: 'audio/wav' }))).toBe(
      false,
    );
  });

  it('converts WebM microphone audio to a WAV file before upload', async () => {
    const source = new Blob(['webm'], { type: 'video/webm;codecs=opus' });
    const wavBlob = new Blob(['wav'], { type: 'audio/wav' });
    const convert = vi.fn().mockResolvedValue(wavBlob);

    const file = await createMicrophoneReferenceAudioFile(source, convert);

    expect(convert).toHaveBeenCalledWith(source, 'wav');
    expect(file.name).toBe('microphone-recording.wav');
    expect(file.type).toBe('audio/wav');
    expect(await file.text()).toBe('wav');
  });

  it('keeps non-WebM microphone audio without invoking conversion', async () => {
    const source = new Blob(['wav'], { type: 'audio/wav' });
    const convert = vi.fn();

    const file = await createMicrophoneReferenceAudioFile(source, convert);

    expect(convert).not.toHaveBeenCalled();
    expect(file.name).toBe('microphone-recording.wav');
    expect(file.type).toBe('audio/wav');
    expect(await file.text()).toBe('wav');
  });
});
