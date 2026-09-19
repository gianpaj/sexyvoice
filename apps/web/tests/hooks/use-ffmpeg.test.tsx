// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cloneStateReducer,
  initialCloneState,
} from '@/app/[lang]/(dashboard)/dashboard/clone/clone-state';
import { useFFmpeg } from '@/app/[lang]/tools/audio-converter/hooks/use-ffmpeg';

const ffmpegMocks = vi.hoisted(() => {
  const instances: unknown[] = [];
  const load = vi.fn<() => Promise<void>>();
  const toBlobURL = vi.fn(async (url: string) => url);

  class FFmpegMock {
    deleteFile = vi.fn();
    exec = vi.fn();
    load = load;
    on = vi.fn();
    readFile = vi.fn();
    writeFile = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  return {
    FFmpegMock,
    instances,
    load,
    toBlobURL,
  };
});

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: ffmpegMocks.FFmpegMock,
}));

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(),
  toBlobURL: ffmpegMocks.toBlobURL,
}));

describe('useFFmpeg', () => {
  beforeEach(() => {
    ffmpegMocks.instances.length = 0;
    ffmpegMocks.load.mockReset();
    ffmpegMocks.toBlobURL.mockClear();
  });

  it('keeps ensureLoaded stable after a failed lazy preload updates state', async () => {
    ffmpegMocks.load.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useFFmpeg({ lazyLoad: true }));
    const firstEnsureLoaded = result.current.ensureLoaded;
    let loadError: unknown;

    await act(async () => {
      try {
        await result.current.ensureLoaded();
      } catch (error) {
        loadError = error;
      }
    });

    expect(loadError).toBeInstanceOf(Error);
    expect(result.current.error).toBe('Failed to load FFmpeg: network');
    expect(result.current.ensureLoaded).toBe(firstEnsureLoaded);
  });

  it('shares a single in-flight FFmpeg load between concurrent calls', async () => {
    let resolveLoad!: () => void;
    ffmpegMocks.load.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const { result } = renderHook(() => useFFmpeg({ lazyLoad: true }));
    let firstLoad!: Promise<void>;
    let secondLoad!: Promise<void>;

    act(() => {
      firstLoad = result.current.ensureLoaded();
      secondLoad = result.current.ensureLoaded();
    });

    expect(ffmpegMocks.instances).toHaveLength(1);
    await waitFor(() => {
      expect(ffmpegMocks.load).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveLoad();
      await Promise.all([firstLoad, secondLoad]);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('cloneStateReducer', () => {
  it('preserves state identity for no-op patches', () => {
    const nextState = cloneStateReducer(initialCloneState, {
      patch: { ffmpegError: null },
      type: 'patch',
    });

    expect(nextState).toBe(initialCloneState);
  });

  it('returns a new state for changed patches', () => {
    const nextState = cloneStateReducer(initialCloneState, {
      patch: { text: 'hello' },
      type: 'patch',
    });

    expect(nextState).not.toBe(initialCloneState);
    expect(nextState.text).toBe('hello');
  });
});
