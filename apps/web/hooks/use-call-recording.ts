'use client';

import {
  useLocalParticipant,
  useVoiceAssistant,
} from '@livekit/components-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { Preset } from '@/data/presets';
import { formatTime } from '@/hooks/use-call-timer';

/** `audio` records the voices; `video` also records the in-call screen. */
export type CallRecordingMode = 'audio' | 'video';

export interface CallRecordingFile {
  filename: string;
  url: string;
}

export type CallRecordingFiles = Partial<
  Record<CallRecordingMode, CallRecordingFile>
>;

export interface CallRecording {
  files: CallRecordingFiles;
  /** The running recording, or null when none is. */
  mode: CallRecordingMode | null;
  start: (mode: CallRecordingMode) => void;
  stop: () => void;
}

// mp4 first: Chrome and Safari write its duration, so players can seek.
// Firefox records only webm.
const MIME_TYPES: Record<CallRecordingMode, string[]> = {
  audio: [
    'audio/mp4;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ],
  video: [
    'video/mp4;codecs=avc1,opus',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm',
  ],
};
const BITRATES: Record<CallRecordingMode, MediaRecorderOptions> = {
  audio: { audioBitsPerSecond: 128_000 },
  video: { audioBitsPerSecond: 128_000, videoBitsPerSecond: 1_000_000 },
};

// Recordings put the user on the left channel and the character on the right.
const USER_CHANNEL = 0;
const CHARACTER_CHANNEL = 1;

const VIDEO_SIZE = 720;
const VIDEO_FPS = 30;
const FONT = 'ui-sans-serif, system-ui, sans-serif';

interface Session {
  connect: (track: MediaStreamTrack, channel: number) => () => void;
  stop: () => void;
}

interface SessionEvents {
  onError: () => void;
  onFile: (kind: CallRecordingMode, blob: Blob, mimeType: string) => void;
}

/** Whether this browser can record a call. */
export function canRecordCalls() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    typeof window.AudioContext === 'function'
  );
}

function record(
  stream: MediaStream,
  kind: CallRecordingMode,
  events: SessionEvents,
) {
  const supported =
    MIME_TYPES[kind].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
  const recorder = new MediaRecorder(stream, {
    ...BITRATES[kind],
    ...(supported && { mimeType: supported }),
  });
  const chunks: Blob[] = [];
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => {
      const mimeType = recorder.mimeType || supported;
      if (chunks.length) {
        events.onFile(kind, new Blob(chunks, { type: mimeType }), mimeType);
      }
      resolve();
    };
  });
  // The recorder stops itself after an error and still reports what it has.
  recorder.onerror = events.onError;
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.start();
  return () => {
    if (recorder.state !== 'inactive') recorder.stop();
    return stopped;
  };
}

export function recordingExtension(mimeType: string, kind: CallRecordingMode) {
  if (mimeType.includes('mp4')) return kind === 'audio' ? 'm4a' : 'mp4';
  return 'webm';
}

/** Draws one frame of the in-call screen: avatar, voice halo, name, time. */
function paint(
  ctx: CanvasRenderingContext2D,
  character: Preset,
  avatar: HTMLImageElement | null,
  level: number,
  elapsed: string,
) {
  const center = VIDEO_SIZE / 2;
  const avatarY = 300;
  const radius = 120;

  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, VIDEO_SIZE, VIDEO_SIZE);

  for (const [spread, alpha] of [
    [34, 0.08],
    [14, 0.18],
  ] as const) {
    ctx.beginPath();
    ctx.arc(center, avatarY, radius + spread + level * 40, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(124, 58, 237, ${alpha + level * 0.2})`;
    ctx.fill();
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(center, avatarY, radius, 0, Math.PI * 2);
  ctx.clip();
  if (avatar?.complete && avatar.naturalWidth) {
    ctx.drawImage(
      avatar,
      center - radius,
      avatarY - radius,
      radius * 2,
      radius * 2,
    );
  } else {
    ctx.fillStyle = '#2e1065';
    ctx.fillRect(center - radius, avatarY - radius, radius * 2, radius * 2);
    ctx.fillStyle = '#ddd6fe';
    ctx.font = `700 96px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      (character.name.trim().charAt(0) || '?').toUpperCase(),
      center,
      avatarY,
    );
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(character.name, center, 520, VIDEO_SIZE - 80);
  ctx.fillStyle = '#94a3b8';
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(elapsed, center, 568);
  ctx.fillStyle = '#c4b5fd';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('sexyvoice.ai', center, 680);
}

/**
 * Records a square video of the in-call screen with the call audio, redrawn
 * every animation frame. Returns its stop function.
 */
function recordVideo(
  context: AudioContext,
  mix: AudioNode,
  audio: MediaStream,
  character: Preset,
  events: SessionEvents,
) {
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_SIZE;
  canvas.height = VIDEO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  let avatar: HTMLImageElement | null = null;
  if (character.image) {
    avatar = new Image();
    avatar.src = `/characters/${character.image}`;
  }
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  mix.connect(analyser);

  const startedAt = performance.now();
  const samples = new Float32Array(analyser.fftSize);
  let level = 0;
  let frame = 0;
  const draw = () => {
    frame = requestAnimationFrame(draw);
    analyser.getFloatTimeDomainData(samples);
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    level = Math.max(Math.min(1, peak * 2), level * 0.9);
    const seconds = Math.floor((performance.now() - startedAt) / 1000);
    paint(ctx, character, avatar, level, formatTime(seconds));
  };
  draw();

  try {
    // Safari ends a recording when a track is added to a running recorder,
    // so the video gets its own recorder over a stream built up front.
    const stream = canvas.captureStream(VIDEO_FPS);
    for (const track of audio.getAudioTracks()) stream.addTrack(track);
    const stop = record(stream, 'video', events);
    return () => {
      cancelAnimationFrame(frame);
      return stop();
    };
  } catch (error) {
    cancelAnimationFrame(frame);
    throw error;
  }
}

/**
 * Mixes both voices into a stereo audio file and, in video mode, also records
 * the in-call screen. Throws, with everything released, when a part fails to
 * start.
 */
function startSession(
  character: Preset,
  mode: CallRecordingMode,
  events: SessionEvents,
): Session {
  const context = new AudioContext();
  const stops: (() => Promise<void>)[] = [];
  const stop = () => {
    Promise.all(stops.map((stopRecorder) => stopRecorder()))
      .then(() => context.close())
      .catch(() => undefined);
  };
  try {
    context.resume().catch(() => undefined);
    const merger = context.createChannelMerger(2);
    const destination = context.createMediaStreamDestination();
    destination.channelCount = 2;
    merger.connect(destination);

    stops.push(record(destination.stream, 'audio', events));
    if (mode === 'video') {
      stops.push(
        recordVideo(context, merger, destination.stream, character, events),
      );
    }

    return {
      connect: (track, channel) => {
        const source = context.createMediaStreamSource(
          new MediaStream([track]),
        );
        source.connect(merger, 0, channel);
        return () => source.disconnect();
      },
      stop,
    };
  } catch (error) {
    stop();
    throw error;
  }
}

/**
 * Records the call in the browser on request: a stereo audio file (you left,
 * the character right) and, in video mode, a square video of the in-call
 * screen. A recording stops when the user stops it or the call ends. Files
 * belong to one call: a new call or a new recording clears them. They stay
 * on the device until the user downloads them.
 *
 * Must be used inside a LiveKit room.
 */
export function useCallRecording(
  character: Preset | undefined,
  inCall: boolean,
): CallRecording {
  const { microphoneTrack } = useLocalParticipant();
  const { audioTrack } = useVoiceAssistant();
  const userTrack = microphoneTrack?.track?.mediaStreamTrack;
  const characterTrack = audioTrack?.publication?.track?.mediaStreamTrack;
  const [mode, setMode] = useState<CallRecordingMode | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [files, setFiles] = useState<CallRecordingFiles>({});
  const urls = useRef<string[]>([]);
  // Recorders report after they stop. Only the latest recording, while the
  // hook is mounted, may add files.
  const current = useRef<object | null>(null);

  const clearFiles = () => {
    current.current = null;
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
    setFiles({});
  };

  const begin = useEffectEvent((recordingMode: CallRecordingMode) => {
    if (!(character && canRecordCalls())) return null;
    clearFiles();
    const token = {};
    current.current = token;
    const { name } = character;
    try {
      return startSession(character, recordingMode, {
        onError: () => {
          if (current.current === token) setMode(null);
        },
        onFile: (kind, blob, mimeType) => {
          if (current.current !== token) return;
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          const filename = `${name} - SexyVoice.${recordingExtension(mimeType, kind)}`;
          setFiles((previous) => ({ ...previous, [kind]: { filename, url } }));
        },
      });
    } catch (error) {
      console.warn('Call recording could not start', error);
      current.current = null;
      return null;
    }
  });

  const startCall = useEffectEvent(clearFiles);

  useEffect(() => {
    if (inCall) startCall();
    else setMode(null);
  }, [inCall]);

  useEffect(() => {
    if (!mode) return;
    const started = begin(mode);
    if (!started) {
      setMode(null);
      return;
    }
    setSession(started);
    return () => {
      started.stop();
      setSession(null);
    };
  }, [mode]);

  useEffect(() => {
    if (session && userTrack) return session.connect(userTrack, USER_CHANNEL);
  }, [session, userTrack]);

  useEffect(() => {
    if (session && characterTrack) {
      return session.connect(characterTrack, CHARACTER_CHANNEL);
    }
  }, [session, characterTrack]);

  useEffect(
    () => () => {
      current.current = null;
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  return {
    files,
    mode,
    start: (next) => {
      if (inCall && canRecordCalls()) setMode(next);
    },
    stop: () => setMode(null),
  };
}
