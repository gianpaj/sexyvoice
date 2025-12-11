import { useEffect, useRef, useState } from 'react';

/**
 * Checks whether the argument is a valid object i.e (key-value pair).
 * @param {any} o
 */
function isObject(o: unknown): o is Record<string, unknown> {
  return Boolean(o && !Array.isArray(o) && typeof o === 'object');
}

/**
 * Checks whether media type(audio/video) constraints are valid.
 * @param {MediaStreamConstraints} mediaType
 */
function validateMediaTrackConstraints(
  mediaType: MediaTrackConstraints | boolean,
): void {
  let supportedMediaConstraints: MediaTrackSupportedConstraints | null = null;

  if (navigator.mediaDevices) {
    supportedMediaConstraints =
      navigator.mediaDevices.getSupportedConstraints();
  }

  if (supportedMediaConstraints === null) {
    return;
  }

  const unSupportedMediaConstraints = Object.keys(
    mediaType as Record<string, unknown>,
  ).filter(
    (constraint) =>
      !supportedMediaConstraints![
        constraint as keyof MediaTrackSupportedConstraints
      ],
  );

  if (unSupportedMediaConstraints.length !== 0) {
    const toText = unSupportedMediaConstraints.join(',');
    console.error(
      `The following constraints ${toText} are not supported on this browser.`,
    );
  }
}

const noop = (): void => {
  // noop function
};

type ErrorCallback = (error: Error) => void;

/**
 * @callback Callback
 * @param {Blob} blob
 *
 * @callback ErrorCallback
 * @param {Error} error
 */
interface MediaRecorderProps {
  blobOptions?: BlobPropertyBag;
  recordScreen?: boolean;
  customMediaStream?: MediaStream;
  onStart?: () => void;
  onStop?: (blob: Blob) => void;
  onDataAvailable?: (data: Blob) => void;
  onError?: ErrorCallback;
  mediaRecorderOptions?: MediaRecorderOptions;
  mediaStreamConstraints?: MediaStreamConstraints;
}

interface MediaRecorderHookOptions {
  error?: unknown;
  status:
    | 'idle'
    | 'acquiring_media'
    | 'ready'
    | 'recording'
    | 'paused'
    | 'stopping'
    | 'stopped'
    | 'failed';
  mediaBlob: Blob | null;
  mediaStream: MediaStream | null;
  isAudioMuted: boolean;
  stopRecording: () => void;
  getMediaStream: () => Promise<MediaStream | undefined>;
  clearMediaStream: () => void;
  clearMediaBlob: () => void;
  startRecording: (timeSlice?: number) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  muteAudio: () => void;
  unMuteAudio: () => void;
  liveStream: MediaStream | null;
}

export default function useMediaRecorder({
  blobOptions,
  recordScreen,
  customMediaStream,
  onStop = noop,
  onStart = noop,
  onError = noop,
  mediaRecorderOptions,
  onDataAvailable = noop,
  mediaStreamConstraints = {},
}: MediaRecorderProps): MediaRecorderHookOptions {
  const mediaChunks = useRef<Blob[]>([]);
  const mediaStream = useRef<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const [status, setStatus] =
    useState<MediaRecorderHookOptions['status']>('idle');
  const [errorCache, cacheError] = useState<unknown>(null);
  const [mediaBlobCache, cacheMediaBlob] = useState<Blob | null>(null);
  const [isAudioMutedCache, cacheIsAudioMuted] = useState(false);

  async function getMediaStream(): Promise<MediaStream | undefined> {
    if (errorCache) {
      cacheError(null);
    }

    setStatus('acquiring_media');

    if (customMediaStream && customMediaStream instanceof MediaStream) {
      mediaStream.current = customMediaStream;
      return customMediaStream;
    }

    try {
      let stream: MediaStream;

      if (recordScreen) {
        stream = await window.navigator.mediaDevices.getDisplayMedia(
          mediaStreamConstraints,
        );
      } else {
        stream = await window.navigator.mediaDevices.getUserMedia(
          mediaStreamConstraints,
        );
      }

      if (recordScreen && mediaStreamConstraints?.audio) {
        const audioStream = await window.navigator.mediaDevices.getUserMedia({
          audio: mediaStreamConstraints.audio,
        });

        for (const audioTrack of audioStream.getAudioTracks()) {
          stream.addTrack(audioTrack);
        }
      }

      mediaStream.current = stream;
      setStatus('ready');

      return stream;
    } catch (err: unknown) {
      cacheError(err);
      setStatus('failed');
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

  async function startRecording(timeSlice?: number): Promise<void> {
    if (errorCache) {
      cacheError(null);
    }

    if (!mediaStream.current) {
      await getMediaStream();
    }

    mediaChunks.current = [];

    if (mediaStream.current) {
      mediaRecorder.current = new MediaRecorder(
        mediaStream.current,
        mediaRecorderOptions,
      );
      mediaRecorder.current.addEventListener(
        'dataavailable',
        handleDataAvailable,
      );
      mediaRecorder.current.addEventListener('stop', handleStop);
      mediaRecorder.current.addEventListener('error', handleError);

      try {
        mediaRecorder.current.start(timeSlice);
        setStatus('recording');
        onStart();
      } catch (error) {
        handleError({
          error: error instanceof Error ? error : new Error(String(error)),
        } as Event & { error: Error });
      }
    }
  }

  function handleDataAvailable(e: BlobEvent): void {
    if (e.data.size) {
      mediaChunks.current.push(e.data);
    }
    onDataAvailable(e.data);
  }

  function handleStop(): void {
    let blob = new Blob();
    let sampleChunk = new Blob();

    if (mediaChunks.current.length) {
      [sampleChunk] = mediaChunks.current;

      const blobPropertyBag = { type: sampleChunk.type, ...blobOptions };

      blob = new Blob(mediaChunks.current, blobPropertyBag);

      cacheMediaBlob(blob);
    }

    setStatus('stopped');
    onStop(blob);
  }

  function handleError(e: Event & { error: Error }): void {
    cacheError(e.error);
    setStatus('idle');
    onError(e.error);
  }

  function muteAudio(mute: boolean): void {
    cacheIsAudioMuted(mute);

    if (mediaStream.current) {
      for (const audioTrack of mediaStream.current.getAudioTracks()) {
        audioTrack.enabled = !mute;
      }
    }
  }

  function pauseRecording(): void {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.pause();
      setStatus('paused');
    }
  }

  function resumeRecording(): void {
    if (mediaRecorder.current && mediaRecorder.current.state === 'paused') {
      mediaRecorder.current.resume();
      setStatus('recording');
    }
  }

  function stopRecording(): void {
    if (mediaRecorder.current) {
      setStatus('stopping');
      mediaRecorder.current.stop();
      // not sure whether to place clean up in useEffect?
      // If placed in useEffect the handler functions become dependencies of useEffect
      mediaRecorder.current.removeEventListener(
        'dataavailable',
        handleDataAvailable,
      );
      mediaRecorder.current.removeEventListener('stop', handleStop);
      mediaRecorder.current.removeEventListener('error', handleError);
      mediaRecorder.current = null;
      if (!customMediaStream) {
        clearMediaStream();
      }
    }
  }

  function clearMediaBlob(): void {
    cacheMediaBlob(null);
  }

  useEffect(() => {
    if (!window.MediaRecorder) {
      throw new ReferenceError(
        'MediaRecorder is not supported in this browser. Please ensure that you are running the latest version of chrome/firefox/edge.',
      );
    }

    if (recordScreen && !window.navigator.mediaDevices.getDisplayMedia) {
      throw new ReferenceError(
        'This browser does not support screen capturing.',
      );
    }

    if (isObject(mediaStreamConstraints.video)) {
      validateMediaTrackConstraints(mediaStreamConstraints.video);
    }

    if (isObject(mediaStreamConstraints.audio)) {
      validateMediaTrackConstraints(mediaStreamConstraints.audio);
    }

    if (
      mediaRecorderOptions?.mimeType &&
      !MediaRecorder.isTypeSupported(mediaRecorderOptions.mimeType)
    ) {
      console.error(
        'The specified MIME type supplied to MediaRecorder is not supported by this browser.',
      );
    }
  }, [mediaStreamConstraints, mediaRecorderOptions, recordScreen]);

  return {
    error: errorCache,
    status,
    mediaBlob: mediaBlobCache,
    mediaStream: mediaStream.current,
    isAudioMuted: isAudioMutedCache,
    stopRecording,
    getMediaStream,
    startRecording,
    pauseRecording,
    resumeRecording,
    clearMediaStream,
    clearMediaBlob,
    muteAudio: () => muteAudio(true),
    unMuteAudio: () => muteAudio(false),
    get liveStream() {
      if (mediaStream.current) {
        return new MediaStream(mediaStream.current.getTracks());
      }
      return null;
    },
  };
}
