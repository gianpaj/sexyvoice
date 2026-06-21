import Replicate, { type Prediction } from 'replicate';

import { getErrorMessage } from '@/lib/utils';

/** Thrown when a Replicate prediction returns an error payload. */
export class ReplicateGenerationError extends Error {
  readonly providerError: unknown;

  constructor(providerError: unknown) {
    super(getErrorMessage('REPLICATE_ERROR', 'voice-generation'), {
      cause: 'REPLICATE_ERROR',
    });
    this.name = 'ReplicateGenerationError';
    this.providerError = providerError;
  }
}

/**
 * Run a Replicate TTS model and return the generated audio as a Buffer.
 *
 * Encapsulates the `replicate.run` call, the `'error' in output` guard, and
 * the stream→Buffer conversion shared by /api/generate-voice and
 * /api/v1/speech. Throws {@link ReplicateGenerationError} (cause:
 * 'REPLICATE_ERROR') so callers' error mapping keeps working.
 */
export async function generateReplicateAudio({
  model,
  text,
  voice,
  signal,
  onProgress,
}: {
  model: string;
  text: string;
  voice: string;
  signal?: AbortSignal;
  onProgress?: (prediction: Prediction) => void;
}): Promise<{ buffer: Buffer }> {
  const replicate = new Replicate();
  const output = (await replicate.run(
    model as `${string}/${string}`,
    { input: { text, voice }, signal },
    onProgress,
  )) as ReadableStream | { error: string };

  if ('error' in output) {
    throw new ReplicateGenerationError(output.error);
  }

  const buffer = Buffer.from(await new Response(output).arrayBuffer());
  return { buffer };
}
