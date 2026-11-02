import {
  type AutomaticSpeechRecognitionOutput,
  type PretrainedModelOptions,
  pipeline,
} from '@huggingface/transformers';

// biome-ignore lint/suspicious/noExplicitAny: pipeline() return type union is too complex for TypeScript to represent
type PipelineFn = (...args: Parameters<typeof pipeline>) => Promise<any>;
const createPipeline = pipeline as PipelineFn;

/**
 * Web Worker for running Whisper speech recognition inference
 * using @huggingface/transformers (Transformers.js).
 *
 * Communicates with the main thread via postMessage:
 * - Receives: { type: 'load', model, quantized }
 * - Receives: { type: 'transcribe', audio: Float32Array, language, subtask }
 * - Sends: { type: 'download', data: progress }
 * - Sends: { type: 'ready' }
 * - Sends: { type: 'update', data: partial results }
 * - Sends: { type: 'complete', data: final results }
 * - Sends: { type: 'error', data: error message }
 */

type TranscriberPipeline = Awaited<
  ReturnType<typeof pipeline<'automatic-speech-recognition'>>
>;

let transcriber: TranscriberPipeline | null = null;

self.addEventListener('message', async (event) => {
  const { type } = event.data;

  if (type === 'load') {
    await loadModel(event.data);
  } else if (type === 'transcribe') {
    await transcribe(event.data);
  }
});

async function loadModel({
  model,
  quantized,
}: {
  model: string;
  quantized: boolean;
}) {
  try {
    const options: PretrainedModelOptions = {
      dtype: quantized ? 'q8' : 'fp32',
      progress_callback: (data: Record<string, unknown>) => {
        self.postMessage({ data, type: 'download' });
      },
    };
    transcriber = await createPipeline(
      'automatic-speech-recognition',
      model,
      options,
    );
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({
      data: error instanceof Error ? error.message : 'Failed to load the model',
      type: 'error',
    });
  }
}

async function transcribe({
  audio,
  language,
  subtask,
}: {
  audio: Float32Array;
  language: string;
  subtask: string;
}) {
  if (!transcriber) {
    self.postMessage({
      data: 'Model not loaded. Please load a model first.',
      type: 'error',
    });
    return;
  }

  try {
    const result = (await transcriber(audio, {
      // callback_function is supported at runtime but not included in the
      // generated type definitions for AutomaticSpeechRecognitionConfig.
      callback_function: (data: AutomaticSpeechRecognitionOutput) => {
        self.postMessage({ data, type: 'update' });
      },
      chunk_length_s: 30,
      language,
      return_timestamps: true,
      stride_length_s: 5,
      task: subtask,
    } as Record<string, unknown>)) as AutomaticSpeechRecognitionOutput;

    self.postMessage({ data: result, type: 'complete' });
  } catch (error) {
    self.postMessage({
      data: error instanceof Error ? error.message : 'Transcription failed',
      type: 'error',
    });
  }
}
