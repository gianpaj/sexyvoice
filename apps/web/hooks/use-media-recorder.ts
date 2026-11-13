import { useEffect, useRef, useState } from 'react';

export type RecorderStatus =
  | 'idle'
  | 'acquiring_media'
  | 'ready'
  | 'recording'
  | 'stopping'
  | 'stopped'
  | 'failed';

interface MediaRecorderProps {
  mediaStreamConstraints?: MediaStreamConstraints;
  /** Called when the browser cannot record or the microphone is unavailable. */
  onError?: (error: Error) => void;
  onStart?: () => void;
  onStop?: (blob: Blob) => void;
}

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

/** Records audio takes from the microphone with `MediaRecorder`. */
export default function useMediaRecorder({
  mediaStreamConstraints = {},
  onError,
  onStart,
  onStop,
}: MediaRecorderProps) {
  const mediaChunks = useRef<Blob[]>([]);
  const mediaStream = useRef<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'MediaRecorder' in window,
  );
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);

  async function getMediaStream(): Promise<MediaStream | undefined> {
    setStatus('acquiring_media');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mediaStreamConstraints,
      );
      mediaStream.current = stream;
      setStatus('ready');
      return stream;
    } catch (error) {
      setStatus('failed');
      onError?.(toError(error));
    }
  }

  function clearMediaStream(): void {
    if (mediaStream.current) {
      for (const track of mediaStream.current.getTracks()) {
        track.stop();
      }
      mediaStream.current = null;
      setStatus('idle');
    }
  }

  function handleDataAvailable(event: BlobEvent): void {
    if (event.data.size) {
      mediaChunks.current.push(event.data);
    }
  }

  function handleStop(): void {
    let blob = new Blob();
    const [sampleChunk] = mediaChunks.current;
    if (sampleChunk) {
      blob = new Blob(mediaChunks.current, { type: sampleChunk.type });
      setMediaBlob(blob);
    }
    setStatus('stopped');
    onStop?.(blob);
  }

  function handleError(error: Error): void {
    setStatus('idle');
    onError?.(error);
  }

  function handleRecorderError(event: Event): void {
    handleError(toError((event as Event & { error?: unknown }).error));
  }

  async function startRecording(): Promise<void> {
    if (!mediaStream.current) {
      await getMediaStream();
    }
    if (!mediaStream.current) {
      return;
    }

    mediaChunks.current = [];
    try {
      mediaRecorder.current = new MediaRecorder(mediaStream.current);
      mediaRecorder.current.addEventListener(
        'dataavailable',
        handleDataAvailable,
      );
      mediaRecorder.current.addEventListener('stop', handleStop);
      mediaRecorder.current.addEventListener('error', handleRecorderError);
      mediaRecorder.current.start();
      setStatus('recording');
      onStart?.();
    } catch (error) {
      mediaRecorder.current = null;
      clearMediaStream();
      handleError(toError(error));
    }
  }

  function stopRecording(): void {
    if (mediaRecorder.current) {
      setStatus('stopping');
      // The recorder fires `dataavailable` and `stop` after this returns.
      mediaRecorder.current.stop();
      mediaRecorder.current = null;
      clearMediaStream();
    }
  }

  function clearMediaBlob(): void {
    setMediaBlob(null);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reports support once
  useEffect(() => {
    // Reported rather than thrown: a throw here would unmount the whole page,
    // including upload paths that work without a recorder.
    if (!supported) {
      setStatus('failed');
      onError?.(
        new ReferenceError('MediaRecorder is not supported in this browser.'),
      );
    }
  }, []);

  return {
    clearMediaBlob,
    clearMediaStream,
    getMediaStream,
    mediaBlob,
    mediaStream: mediaStream.current,
    startRecording,
    status,
    stopRecording,
    /** False in browsers without `MediaRecorder`; they can still upload. */
    supported,
  };
}
