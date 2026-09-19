import { describe, expect, it } from 'vitest';

import {
  decodePcmBase64,
  encodeWavFromPcmChunks,
  parseSampleRate,
  WaveformPeakAccumulator,
} from '@/lib/pcm-wav';

describe('parseSampleRate', () => {
  it('reads the rate from an L16 mime type', () => {
    expect(parseSampleRate('audio/L16;rate=24000')).toBe(24_000);
    expect(parseSampleRate('audio/L16; rate=16000')).toBe(16_000);
  });

  it('falls back to 24000 when no rate is present', () => {
    expect(parseSampleRate('audio/L16')).toBe(24_000);
    expect(parseSampleRate('')).toBe(24_000);
  });
});

describe('encodeWavFromPcmChunks', () => {
  it('produces a valid mono 16-bit WAV header and data', async () => {
    const chunk = Int16Array.from([0, 100, -100, 32_000]);
    const blob = encodeWavFromPcmChunks([chunk], 24_000);
    expect(blob.type).toBe('audio/wav');

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const text = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(buffer, offset, length));

    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(24_000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(text(36, 4)).toBe('data');

    const dataBytes = chunk.length * 2;
    expect(view.getUint32(40, true)).toBe(dataBytes);
    expect(buffer.byteLength).toBe(44 + dataBytes);
    // Samples round-trip little-endian.
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(100);
    expect(view.getInt16(48, true)).toBe(-100);
    expect(view.getInt16(50, true)).toBe(32_000);
  });

  it('concatenates multiple chunks', async () => {
    const blob = encodeWavFromPcmChunks(
      [Int16Array.from([1, 2]), Int16Array.from([3])],
      24_000,
    );
    const buffer = await blob.arrayBuffer();
    expect(buffer.byteLength).toBe(44 + 3 * 2);
  });
});

describe('WaveformPeakAccumulator', () => {
  it('emits one signed peak (largest magnitude) per bin', () => {
    const acc = new WaveformPeakAccumulator(4);
    // Two full bins: max magnitude is -0.9 then 0.7.
    acc.push(Float32Array.from([0.1, -0.9, 0.2, 0.3, 0.5, 0.7, -0.1, 0.0]));
    const peaks = acc.getPeaks();
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(-0.9, 5);
    expect(peaks[1]).toBeCloseTo(0.7, 5);
    expect(acc.sampleCount).toBe(8);
  });

  it('includes the in-progress (partial) bin so the tail is visible', () => {
    const acc = new WaveformPeakAccumulator(4);
    acc.push(Float32Array.from([0.1, 0.2])); // partial bin
    const partial = acc.getPeaks();
    expect(partial).toHaveLength(1);
    expect(partial[0]).toBeCloseTo(0.2, 5);
    acc.push(Float32Array.from([0.9, 0.3])); // completes the bin (max 0.9)
    const full = acc.getPeaks();
    expect(full).toHaveLength(1);
    expect(full[0]).toBeCloseTo(0.9, 5);
  });
});

describe('decodePcmBase64', () => {
  it('decodes base64 L16 into int16 + normalized float32', () => {
    // Two samples: 0 and 32767 (0x7FFF) little-endian.
    const base64 = btoa(String.fromCharCode(0x00, 0x00, 0xff, 0x7f));
    const { int16, float32 } = decodePcmBase64(base64);
    expect(Array.from(int16)).toEqual([0, 32_767]);
    expect(float32[0]).toBe(0);
    expect(float32[1]).toBeCloseTo(32_767 / 32_768, 5);
  });
});
