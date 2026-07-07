// Client-side helpers for the gpro31 streaming player: assemble a playable WAV
// from accumulated PCM chunks and compute a progressively-growing waveform.

/** Parse the sample rate from an L16 mime type (e.g. `audio/L16;rate=24000`). */
export function parseSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 24_000;
}

/** Build a 16-bit mono PCM WAV Blob from accumulated Int16 chunks. */
export function encodeWavFromPcmChunks(
  chunks: Int16Array[],
  sampleRate: number,
): Blob {
  let length = 0;
  for (const chunk of chunks) {
    length += chunk.length;
  }

  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * blockAlign)
  view.setUint16(32, 2, true); // block align (channels * bytesPerSample)
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Accumulates a decimated waveform as PCM samples stream in, keeping the
 * signed value with the largest magnitude in each bin so wavesurfer can render
 * a representative envelope without decoding the audio.
 */
export class WaveformPeakAccumulator {
  private readonly samplesPerPeak: number;
  private readonly peaks: number[] = [];
  private currentPeak = 0;
  private countInBin = 0;
  private totalSamples = 0;

  constructor(samplesPerPeak = 512) {
    this.samplesPerPeak = Math.max(1, samplesPerPeak);
  }

  push(samples: Float32Array): void {
    for (const value of samples) {
      if (Math.abs(value) > Math.abs(this.currentPeak)) {
        this.currentPeak = value;
      }
      this.countInBin++;
      if (this.countInBin >= this.samplesPerPeak) {
        this.peaks.push(this.currentPeak);
        this.currentPeak = 0;
        this.countInBin = 0;
      }
    }
    this.totalSamples += samples.length;
  }

  /** Snapshot of peaks so far, including the in-progress bin (so the tail of a
   * still-growing waveform is visible). */
  getPeaks(): number[] {
    if (this.countInBin > 0) {
      return [...this.peaks, this.currentPeak];
    }
    return [...this.peaks];
  }

  get sampleCount(): number {
    return this.totalSamples;
  }
}

/** Decode a base64 L16 PCM chunk into both Int16 (for WAV) and Float32 (for
 * playback / peaks). */
export function decodePcmBase64(base64: string): {
  int16: Int16Array;
  float32: Float32Array<ArrayBuffer>;
} {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  // L16 is little-endian 16-bit; the byte length is always even for valid PCM.
  const int16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const float32 = new Float32Array(int16.length) as Float32Array<ArrayBuffer>;
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32_768;
  }
  return { int16, float32 };
}
