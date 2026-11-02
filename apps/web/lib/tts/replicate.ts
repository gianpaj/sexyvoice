import Replicate, { type Prediction } from 'replicate';

/**
 * Run a Replicate TTS model and return the generated audio as a Buffer.
 * SDK errors propagate to the caller's provider error handling.
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
  )) as ReadableStream;

  const buffer = Buffer.from(await new Response(output).arrayBuffer());
  return { buffer };
}
