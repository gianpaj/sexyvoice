'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

export interface TranscriptChunk {
  text: string;
  timestamp: [number, number | null];
}

export interface TranscriptionResult {
  chunks?: TranscriptChunk[];
  text: string;
}

export interface DownloadProgress {
  file?: string;
  loaded?: number;
  name?: string;
  progress?: number;
  status: string;
  total?: number;
}

type TranscriberState = 'idle' | 'loading' | 'ready' | 'transcribing';

interface UseTranscriberReturn {
  downloadProgress: DownloadProgress[];
  error: string | null;
  loadModel: (model: string, quantized: boolean) => void;
  partialTranscript: string;
  reset: () => void;
  state: TranscriberState;
  transcribe: (audio: Float32Array, language: string, subtask: string) => void;
  transcript: TranscriptionResult | null;
}

interface TranscriberDataState {
  downloadProgress: DownloadProgress[];
  error: string | null;
  partialTranscript: string;
  state: TranscriberState;
  transcript: TranscriptionResult | null;
}

type TranscriberAction =
  | { type: 'load-model' }
  | { type: 'transcribe-start' }
  | { type: 'ready' }
  | { data: DownloadProgress; type: 'download' }
  | { data: string; type: 'update' }
  | { data: TranscriptionResult; type: 'complete' }
  | { data: string; type: 'error' }
  | { type: 'reset' };

const initialTranscriberState: TranscriberDataState = {
  downloadProgress: [],
  error: null,
  partialTranscript: '',
  state: 'idle',
  transcript: null,
};

function transcriberReducer(
  state: TranscriberDataState,
  action: TranscriberAction,
): TranscriberDataState {
  switch (action.type) {
    case 'load-model':
      return {
        ...state,
        state: 'loading',
        error: null,
        downloadProgress: [],
      };
    case 'transcribe-start':
      return {
        ...state,
        state: 'transcribing',
        error: null,
        transcript: null,
        partialTranscript: '',
      };
    case 'ready':
      return {
        ...state,
        state: 'ready',
      };
    case 'download': {
      const existing = state.downloadProgress.findIndex(
        (progress) =>
          progress.file === action.data.file &&
          progress.name === action.data.name,
      );

      if (existing >= 0) {
        const updated = [...state.downloadProgress];
        updated[existing] = action.data;
        return {
          ...state,
          downloadProgress: updated,
        };
      }

      return {
        ...state,
        downloadProgress: [...state.downloadProgress, action.data],
      };
    }
    case 'update':
      return action.data
        ? {
            ...state,
            partialTranscript: action.data,
          }
        : state;
    case 'complete':
      return {
        ...state,
        state: 'ready',
        transcript: action.data,
        partialTranscript: '',
        error: null,
      };
    case 'error':
      return {
        ...state,
        state: 'idle',
        downloadProgress: [],
        transcript: null,
        partialTranscript: '',
        error: action.data,
      };
    case 'reset':
      return {
        ...state,
        state: state.state === 'ready' ? 'ready' : 'idle',
        transcript: null,
        partialTranscript: '',
        error: null,
      };
    default:
      return state;
  }
}

export function useTranscriber(): UseTranscriberReturn {
  const workerRef = useRef<Worker | null>(null);
  const [transcriberState, dispatch] = useReducer(
    transcriberReducer,
    initialTranscriberState,
  );
  const { state, transcript, partialTranscript, downloadProgress, error } =
    transcriberState;

  useEffect(() => {
    const worker = new Worker(new URL('../worker.ts', import.meta.url), {
      type: 'module',
    });

    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data;

      switch (type) {
        case 'download':
          dispatch({ type: 'download', data });
          break;
        case 'ready':
          dispatch({ type: 'ready' });
          break;
        case 'update':
          dispatch({ type: 'update', data: data?.text ?? '' });
          break;
        case 'complete':
          dispatch({ type: 'complete', data });
          break;
        case 'error':
          dispatch({ type: 'error', data });
          break;
        default:
          break;
      }
    };

    worker.addEventListener('message', handleMessage);
    workerRef.current = worker;

    return () => {
      worker.removeEventListener('message', handleMessage);
      workerRef.current = null;
      worker.terminate();
    };
  }, []);

  const loadModel = useCallback((model: string, quantized: boolean) => {
    dispatch({ type: 'load-model' });
    workerRef.current?.postMessage({ type: 'load', model, quantized });
  }, []);

  const transcribe = useCallback(
    (audio: Float32Array, language: string, subtask: string) => {
      dispatch({ type: 'transcribe-start' });
      workerRef.current?.postMessage({
        type: 'transcribe',
        audio,
        language,
        subtask,
      });
    },
    [],
  );

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  return {
    state,
    transcript,
    partialTranscript,
    downloadProgress,
    error,
    loadModel,
    transcribe,
    reset,
  };
}
