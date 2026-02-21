'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TranscriptChunk {
  text: string;
  timestamp: [number, number | null];
}

export interface TranscriptionResult {
  text: string;
  chunks?: TranscriptChunk[];
}

export interface DownloadProgress {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

type TranscriberState = 'idle' | 'loading' | 'ready' | 'transcribing';

interface UseTranscriberReturn {
  state: TranscriberState;
  transcript: TranscriptionResult | null;
  partialTranscript: string;
  downloadProgress: DownloadProgress[];
  error: string | null;
  loadModel: (model: string, quantized: boolean) => void;
  transcribe: (audio: Float32Array, language: string, subtask: string) => void;
  reset: () => void;
}

export function useTranscriber(): UseTranscriberReturn {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<TranscriberState>('idle');
  const [transcript, setTranscript] = useState<TranscriptionResult | null>(
    null,
  );
  const [partialTranscript, setPartialTranscript] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('message', (event) => {
      const { type, data } = event.data;

      switch (type) {
        case 'download':
          setDownloadProgress((prev) => {
            const existing = prev.findIndex(
              (p) => p.file === data.file && p.name === data.name,
            );
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = data;
              return updated;
            }
            return [...prev, data];
          });
          break;
        case 'ready':
          setState('ready');
          break;
        case 'update':
          if (data?.text) {
            setPartialTranscript(data.text);
          }
          break;
        case 'complete':
          setState('ready');
          setTranscript(data);
          setPartialTranscript('');
          break;
        case 'error':
          setState('idle');
          setDownloadProgress([]);
          setTranscript(null);
          setPartialTranscript('');
          setError(data);
          break;
      }
    });

    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  const loadModel = useCallback((model: string, quantized: boolean) => {
    setState('loading');
    setError(null);
    setDownloadProgress([]);
    workerRef.current?.postMessage({ type: 'load', model, quantized });
  }, []);

  const transcribe = useCallback(
    (audio: Float32Array, language: string, subtask: string) => {
      setState('transcribing');
      setError(null);
      setTranscript(null);
      setPartialTranscript('');
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
    setState((prev) => (prev === 'ready' ? 'ready' : 'idle'));
    setTranscript(null);
    setPartialTranscript('');
    setError(null);
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
