import { describe, expect, it, vi } from 'vitest';

import {
  createMicrophoneReferenceAudioFile,
  needsWavConversion,
} from '@/lib/clone/microphone-reference-audio';

describe('microphone reference audio', () => {
  it.each([
    ['video/webm;codecs=opus', true],
    ['audio/mp4', true],
    ['audio/webm', true],
    ['audio/wav', false],
    ['audio/ogg;codecs=opus', false],
    ['audio/mpeg', false],
  ])('converts a %s take: %s', (type, converted) => {
    expect(needsWavConversion(new Blob(['take'], { type }))).toBe(converted);
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

  it('uploads an Ogg take as recorded, named for its type', async () => {
    const source = new Blob(['ogg'], { type: 'audio/ogg;codecs=opus' });
    const convert = vi.fn();

    const file = await createMicrophoneReferenceAudioFile(source, convert);

    expect(convert).not.toHaveBeenCalled();
    expect(file.name).toBe('microphone-recording.ogg');
    expect(file.type).toBe('audio/ogg;codecs=opus');
    expect(await file.text()).toBe('ogg');
  });
});
