import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const CALL_VOICE_SAMPLE_TEXT =
  "Hello, I'm here to guide you into a world of intimate whispers and sensual bliss.  Just relax and let my voice wrap around you.  What desire shall we explore first?";

const samplePrefix = (referenceId: string) =>
  `call-voice-samples/${referenceId}/`;

export function createCallVoiceSampleKey(referenceId: string) {
  return `${samplePrefix(referenceId)}${randomUUID()}.wav`;
}

/** Only read an object inside this owned profile's sample prefix. */
export function getCallVoiceSampleKey(sampleUrl: string, referenceId: string) {
  const key = new URL(sampleUrl).pathname.slice(1);
  const prefix = samplePrefix(referenceId);
  const filename = key.slice(prefix.length);
  if (
    !(
      key.startsWith(prefix) &&
      filename.endsWith('.wav') &&
      z.uuid().safeParse(filename.slice(0, -4)).success
    )
  ) {
    throw new Error('Invalid saved voice sample path');
  }
  return key;
}
