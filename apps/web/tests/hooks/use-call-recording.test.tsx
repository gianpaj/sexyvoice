// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSessionConfig } from '@/data/default-config';
import type { Preset } from '@/data/presets';
import { useCallRecording } from '@/hooks/use-call-recording';

vi.mock('@livekit/components-react', () => ({
  useLocalParticipant: () => ({
    microphoneTrack: { track: { mediaStreamTrack: { kind: 'audio' } } },
  }),
  useVoiceAssistant: () => ({ audioTrack: undefined }),
}));

const character: Preset = {
  id: '6f1d9c2a-0000-4000-8000-000000000001',
  instructions: '',
  isPublic: true,
  localizedDescriptions: { en: 'Shy, warm, and playful.' },
  name: 'Lily',
  sessionConfig: { ...defaultSessionConfig, voice: 'Ara' },
  voiceName: 'Ara',
  voiceSampleUrl: 'https://cdn.example.com/ara.mp3',
};

const recorders: FakeRecorder[] = [];
const contexts: { close: ReturnType<typeof vi.fn> }[] = [];
let supportedTypes: string[] = [];
let recorderFails = false;

class FakeRecorder {
  static isTypeSupported = (type: string) => supportedTypes.includes(type);
  mimeType: string;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: unknown, options: MediaRecorderOptions) {
    if (recorderFails) throw new Error('NotSupportedError');
    this.mimeType = options.mimeType ?? '';
    recorders.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['sound']) });
      this.onstop?.();
    });
  }
}

class FakeAudioContext {
  close = vi.fn(() => Promise.resolve());
  constructor() {
    contexts.push(this);
  }
  resume = () => Promise.resolve();
  createChannelMerger = () => ({ connect: vi.fn() });
  createMediaStreamDestination = () => ({
    channelCount: 1,
    stream: { getAudioTracks: () => [] },
  });
  createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  createAnalyser = () => ({
    fftSize: 1024,
    getFloatTimeDomainData: vi.fn(),
  });
}

const createObjectURL = vi.fn((_blob: Blob) => `blob:${Math.random()}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  recorders.length = 0;
  contexts.length = 0;
  supportedTypes = ['audio/mp4;codecs=opus'];
  recorderFails = false;
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('MediaStream', class {});
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderRecording(inCall = true) {
  return renderHook(
    ({ active }: { active: boolean }) => useCallRecording(character, active),
    { initialProps: { active: inCall } },
  );
}

describe('useCallRecording', () => {
  it('records voice only until stopped', async () => {
    const { result } = renderRecording();

    act(() => result.current.start('audio'));
    expect(result.current.mode).toBe('audio');
    expect(recorders).toHaveLength(1);

    act(() => result.current.stop());

    await waitFor(() =>
      expect(result.current.files.audio?.filename).toBe('Lily - SexyVoice.m4a'),
    );
    expect(result.current.files.video).toBeUndefined();
    expect(result.current.mode).toBeNull();
    expect(contexts[0].close).toHaveBeenCalled();
  });

  it('names webm recordings by their type', async () => {
    supportedTypes = ['audio/webm;codecs=opus'];
    const { result } = renderRecording();

    act(() => result.current.start('audio'));
    act(() => result.current.stop());

    await waitFor(() =>
      expect(result.current.files.audio?.filename).toBe(
        'Lily - SexyVoice.webm',
      ),
    );
  });

  it('keeps the files when the call ends and clears them for the next call', async () => {
    const { rerender, result } = renderRecording();
    act(() => result.current.start('audio'));

    rerender({ active: false });

    expect(result.current.mode).toBeNull();
    await waitFor(() => expect(result.current.files.audio).toBeDefined());
    const { url } = result.current.files.audio ?? {};

    rerender({ active: true });

    expect(result.current.files).toEqual({});
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('returns to idle when a recorder cannot start', () => {
    recorderFails = true;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderRecording();

    act(() => result.current.start('audio'));

    expect(result.current.mode).toBeNull();
    expect(result.current.files).toEqual({});
  });

  it('releases the audio recorder when the video cannot start', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderRecording();

    act(() => result.current.start('video'));

    expect(result.current.mode).toBeNull();
    expect(recorders[0].state).toBe('inactive');
    await waitFor(() => expect(contexts[0].close).toHaveBeenCalled());
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('drops a recording that finishes after unmount', async () => {
    const { result, unmount } = renderRecording();
    act(() => result.current.start('audio'));

    unmount();

    await waitFor(() => expect(contexts[0].close).toHaveBeenCalled());
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('stops recording after a recorder error', () => {
    const { result } = renderRecording();
    act(() => result.current.start('audio'));

    act(() => recorders[0].onerror?.());

    expect(result.current.mode).toBeNull();
  });
});
