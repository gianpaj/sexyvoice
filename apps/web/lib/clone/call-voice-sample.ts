import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const CALL_VOICE_SAMPLE_TEXT =
  "Hello, I'm here to guide you into a world of intimate whispers and sensual bliss.  Just relax and let my voice wrap around you.  What desire shall we explore first?";

/** Inworld speaks MP3 and Mistral WAV; the key's extension names the format. */
const SAMPLE_CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
} as const;

export type CallVoiceSampleFormat = keyof typeof SAMPLE_CONTENT_TYPES;

const samplePrefix = (referenceId: string) =>
  `call-voice-samples/${referenceId}/`;

function sampleFormat(key: string): CallVoiceSampleFormat | null {
  const format = key.slice(key.lastIndexOf('.') + 1);
  return Object.hasOwn(SAMPLE_CONTENT_TYPES, format)
    ? (format as CallVoiceSampleFormat)
    : null;
}

export function createCallVoiceSampleKey(
  referenceId: string,
  format: CallVoiceSampleFormat,
) {
  return `${samplePrefix(referenceId)}${randomUUID()}.${format}`;
}

/** Only read an object inside this owned profile's sample prefix. */
export function getCallVoiceSampleKey(sampleUrl: string, referenceId: string) {
  const key = new URL(sampleUrl).pathname.slice(1);
  const prefix = samplePrefix(referenceId);
  const format = sampleFormat(key);
  if (
    !(
      key.startsWith(prefix) &&
      format &&
      z.uuid().safeParse(key.slice(prefix.length, -(format.length + 1))).success
    )
  ) {
    throw new Error('Invalid saved voice sample path');
  }
  return key;
}

/** Content type of a key returned by `getCallVoiceSampleKey`. */
export function getCallVoiceSampleContentType(key: string) {
  const format = sampleFormat(key);
  if (!format) throw new Error('Invalid saved voice sample path');
  return SAMPLE_CONTENT_TYPES[format];
}
