import {
  type AutomaticSpeechRecognitionOutput,
  pipeline,
} from '@huggingface/transformers';

/**
 * Web Worker for running Whisper speech recognition inference
 * using @huggingface/transformers (Transformers.js).
 *
 * Communicates with the main thread via postMessage:
 * - Receives: { type: 'load', model, language, subtask, quantized }
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
    transcriber = await pipeline('automatic-speech-recognition', model, {
      quantized,
      dtype: 'fp32',
      progress_callback: (data: Record<string, unknown>) => {
        self.postMessage({ type: 'download', data });
      },
    });
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({
      type: 'error',
      data:
        error instanceof Error ? error.message : 'Failed to load the model',
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
      type: 'error',
      data: 'Model not loaded. Please load a model first.',
    });
    return;
  }

  try {
    const result = (await transcriber(audio, {
      language,
      task: subtask,
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      callback_function: (data: AutomaticSpeechRecognitionOutput) => {
        self.postMessage({ type: 'update', data });
      },
    })) as AutomaticSpeechRecognitionOutput;

    self.postMessage({ type: 'complete', data: result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      data:
        error instanceof Error ? error.message : 'Transcription failed',
    });
  }
}
