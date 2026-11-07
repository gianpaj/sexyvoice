// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFFmpeg } from '@/hooks/use-ffmpeg';

const ffmpegMocks = vi.hoisted(() => {
  const instances: unknown[] = [];
  const load = vi.fn<() => Promise<void>>();
  const toBlobURL = vi.fn(async (url: string) => url);

  class FFmpegMock {
    deleteFile = vi.fn();
    exec = vi.fn();
    load = load;
    off = vi.fn();
    on = vi.fn();
    readFile = vi.fn(async () => new Uint8Array([1, 2, 3]));
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
    let firstLoad!: Promise<unknown>;
    let secondLoad!: Promise<unknown>;

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

  it('removes its progress listener after each conversion', async () => {
    ffmpegMocks.load.mockResolvedValue(undefined);
    const { result } = renderHook(() => useFFmpeg({ lazyLoad: true }));

    let audio!: Blob;
    await act(async () => {
      audio = await result.current.convert(new Blob(['take']), 'wav');
    });

    const [instance] = ffmpegMocks.instances as InstanceType<
      typeof ffmpegMocks.FFmpegMock
    >[];
    const handler = instance.on.mock.calls.find(
      ([event]) => event === 'progress',
    )?.[1];
    expect(handler).toBeTypeOf('function');
    expect(instance.off).toHaveBeenCalledWith('progress', handler);
    expect(audio.type).toBe('audio/wav');
  });
});
