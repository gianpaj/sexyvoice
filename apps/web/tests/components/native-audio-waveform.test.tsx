// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaveSurferOptions } from 'wavesurfer.js';

import { AUDIO_WAVEFORM_DEFAULTS } from '@/components/audio-waveform';
import {
  NativeAudioWaveform,
  type NativeAudioWaveformProps,
} from '@/components/native-audio-waveform';

const { instances, create } = vi.hoisted(() => {
  const instances: {
    options: WaveSurferOptions;
    on: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    emitError: (error: Error) => void;
  }[] = [];
  const create = vi.fn((options: WaveSurferOptions) => {
    let errorListener: ((error: Error) => void) | undefined;
    const unsubscribe = vi.fn(() => {
      errorListener = undefined;
    });
    const instance = {
      options,
      on: vi.fn((event: string, listener: (error: Error) => void) => {
        if (event === 'error') {
          errorListener = listener;
        }
        return unsubscribe;
      }),
      unsubscribe,
      load: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      emitError: (error: Error) => errorListener?.(error),
    };
    instances.push(instance);
    return instance;
  });
  return { instances, create };
});

vi.mock('wavesurfer.js', () => ({ default: { create } }));

// Only the shared constants are needed from the generic renderer module.
vi.mock('@wavesurfer/react', () => ({ default: vi.fn(() => null) }));

describe('NativeAudioWaveform', () => {
  let props: NativeAudioWaveformProps;
  const url = 'https://example.com/voice.mp3';
  const nextUrl = 'https://example.com/next.mp3';
  const peaks = [[0, 0.5, -0.5, 0]];
  const nextPeaks = [[0, 0.25, -0.25, 0]];

  beforeEach(() => {
    vi.clearAllMocks();
    instances.length = 0;
    const media = document.createElement('audio');
    media.src = url;
    props = { media, url, duration: 12, peaks };
  });

  afterEach(cleanup);

  it('creates with cached peaks, native media, and exact shared defaults', () => {
    const { container } = render(<NativeAudioWaveform {...props} />);

    expect(create).toHaveBeenCalledExactlyOnceWith({
      ...AUDIO_WAVEFORM_DEFAULTS,
      container: container.firstElementChild,
      media: props.media,
      url,
      peaks,
      duration: 12,
      interact: false,
      fetchParams: { signal: expect.any(AbortSignal) },
    });
    expect(instances[0].options.peaks).toBe(peaks);
    expect(AUDIO_WAVEFORM_DEFAULTS).toEqual({
      height: 48,
      barGap: 2,
      barRadius: 2,
      barWidth: 2,
      cursorColor: 'transparent',
      waveColor: '#a1a1aa',
      progressColor: '#7c3aed',
    });
    expect(container.childElementCount).toBe(1);
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(container.querySelector('audio, video')).toBeNull();
    expect(instances[0].options.fetchParams?.signal?.aborted).toBe(false);
    expect(instances[0].load).not.toHaveBeenCalled();
    expect(props.media.src).toBe(url);
  });

  it('keeps the instance, container, and signal across A → B → A', () => {
    props.media.currentTime = 3;
    const pause = vi.spyOn(props.media, 'pause');
    const play = vi.spyOn(props.media, 'play');
    const { container, rerender } = render(<NativeAudioWaveform {...props} />);
    const element = container.firstElementChild;
    const instance = instances[0];
    const signal = instance.options.fetchParams?.signal;

    rerender(
      <NativeAudioWaveform
        {...props}
        duration={24}
        peaks={nextPeaks}
        url={nextUrl}
      />,
    );
    rerender(<NativeAudioWaveform {...props} />);

    expect(create).toHaveBeenCalledOnce();
    expect(container.firstElementChild).toBe(element);
    expect(instance.load).toHaveBeenCalledTimes(2);
    expect(instance.load).toHaveBeenNthCalledWith(1, nextUrl, nextPeaks, 24);
    expect(instance.load.mock.calls[0][1]).toBe(nextPeaks);
    expect(instance.load).toHaveBeenNthCalledWith(2, url, peaks, 12);
    expect(instance.load.mock.calls[1][1]).toBe(peaks);
    expect(instance.destroy).not.toHaveBeenCalled();
    expect(instance.unsubscribe).not.toHaveBeenCalled();
    expect(signal?.aborted).toBe(false);
    expect(props.media.currentTime).toBe(3);
    expect(props.media.src).toBe(url);
    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    pause.mockRestore();
    play.mockRestore();
  });

  it('waits for the latest ready data before creating the first instance', () => {
    const { container, rerender } = render(
      <NativeAudioWaveform {...props} ready={false} />,
    );
    const element = container.firstElementChild;
    rerender(<NativeAudioWaveform {...props} ready={false} url={nextUrl} />);
    expect(create).not.toHaveBeenCalled();
    expect(element?.childElementCount).toBe(0);

    rerender(
      <NativeAudioWaveform
        {...props}
        duration={24}
        peaks={nextPeaks}
        ready
        url={nextUrl}
      />,
    );
    expect(create).toHaveBeenCalledOnce();
    expect(instances[0].options).toMatchObject({
      url: nextUrl,
      peaks: nextPeaks,
      duration: 24,
    });
    expect(container.firstElementChild).toBe(element);
    expect(instances[0].load).not.toHaveBeenCalled();
  });

  it('retains the existing waveform untouched while data is not ready', () => {
    const { container, rerender } = render(<NativeAudioWaveform {...props} />);
    const element = container.firstElementChild;
    const instance = instances[0];
    const canvas = document.createElement('canvas');
    element?.appendChild(canvas);

    rerender(
      <NativeAudioWaveform
        {...props}
        duration={24}
        peaks={nextPeaks}
        ready={false}
        reloadKey={1}
        url={nextUrl}
      />,
    );
    rerender(<NativeAudioWaveform {...props} ready={false} reloadKey={2} />);
    expect(instance.load).not.toHaveBeenCalled();
    expect(instance.destroy).not.toHaveBeenCalled();
    expect(instance.unsubscribe).not.toHaveBeenCalled();
    expect(instance.options.fetchParams?.signal?.aborted).toBe(false);
    expect(container.querySelector('canvas')).toBe(canvas);

    rerender(
      <NativeAudioWaveform
        {...props}
        duration={24}
        peaks={nextPeaks}
        reloadKey={2}
        url={nextUrl}
      />,
    );
    expect(create).toHaveBeenCalledOnce();
    expect(instance.load).toHaveBeenCalledExactlyOnceWith(
      nextUrl,
      nextPeaks,
      24,
    );
    expect(container.firstElementChild).toBe(element);
  });

  it('loads the latest ready data even while earlier load promises are pending', async () => {
    const { rerender } = render(<NativeAudioWaveform {...props} />);
    const instance = instances[0];
    let finishEarlierLoad: (() => void) | undefined;
    instance.load.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishEarlierLoad = resolve;
        }),
    );

    rerender(
      <NativeAudioWaveform {...props} peaks={nextPeaks} url={nextUrl} />,
    );
    rerender(<NativeAudioWaveform {...props} ready={false} />);
    rerender(<NativeAudioWaveform {...props} duration={18} />);
    expect(instance.load).toHaveBeenCalledTimes(2);
    expect(instance.load).toHaveBeenLastCalledWith(url, peaks, 18);

    await act(async () => finishEarlierLoad?.());
    expect(instance.load).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledOnce();
    expect(instance.destroy).not.toHaveBeenCalled();
  });

  it('loads changes to peaks, duration, or reloadKey without recreating', () => {
    const { rerender } = render(<NativeAudioWaveform {...props} />);
    const instance = instances[0];
    rerender(<NativeAudioWaveform {...props} peaks={nextPeaks} />);
    rerender(
      <NativeAudioWaveform {...props} duration={24} peaks={nextPeaks} />,
    );
    rerender(
      <NativeAudioWaveform
        {...props}
        duration={24}
        peaks={nextPeaks}
        reloadKey={1}
      />,
    );
    rerender(
      <NativeAudioWaveform
        {...props}
        duration={24}
        peaks={nextPeaks}
        reloadKey={1}
      />,
    );
    expect(create).toHaveBeenCalledOnce();
    expect(instance.load).toHaveBeenCalledTimes(3);
    expect(instance.load).toHaveBeenNthCalledWith(1, url, nextPeaks, 12);
    expect(instance.load).toHaveBeenNthCalledWith(2, url, nextPeaks, 24);
    expect(instance.load).toHaveBeenNthCalledWith(3, url, nextPeaks, 24);
    expect(instance.destroy).not.toHaveBeenCalled();
  });

  it('unsubscribes, aborts, then destroys on unmount', () => {
    const onError = vi.fn();
    const { unmount } = render(
      <NativeAudioWaveform {...props} onError={onError} />,
    );
    const instance = instances[0];
    const signal = instance.options.fetchParams?.signal;
    const onAbort = vi.fn();
    signal?.addEventListener('abort', onAbort);

    unmount();

    expect(instance.unsubscribe).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
    expect(instance.destroy).toHaveBeenCalledOnce();
    expect(instance.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
      onAbort.mock.invocationCallOrder[0],
    );
    expect(onAbort.mock.invocationCallOrder[0]).toBeLessThan(
      instance.destroy.mock.invocationCallOrder[0],
    );
    instance.emitError(new Error('obsolete load'));
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps distinct per-instance signals and peaks for queued StrictMode loads', async () => {
    const queuedLoads: WaveSurferOptions[] = [];
    const createInstance = create.getMockImplementation();
    if (!createInstance) {
      throw new Error('WaveSurfer create mock must have an implementation');
    }
    create.mockImplementationOnce((options) => {
      queueMicrotask(() => queuedLoads.push(options));
      return createInstance(options);
    });
    const { rerender, unmount } = render(
      <StrictMode>
        <NativeAudioWaveform {...props} />
      </StrictMode>,
    );
    expect(create).toHaveBeenCalledTimes(2);
    const [obsolete, current] = instances;
    expect(obsolete.options.fetchParams?.signal).not.toBe(
      current.options.fetchParams?.signal,
    );
    expect(obsolete.options.fetchParams?.signal?.aborted).toBe(true);
    expect(obsolete.unsubscribe).toHaveBeenCalledOnce();
    expect(obsolete.destroy).toHaveBeenCalledOnce();
    expect(current.options.fetchParams?.signal?.aborted).toBe(false);
    expect(current.destroy).not.toHaveBeenCalled();

    rerender(
      <StrictMode>
        <NativeAudioWaveform
          {...props}
          duration={24}
          peaks={nextPeaks}
          url={nextUrl}
        />
      </StrictMode>,
    );
    await act(async () => {});
    expect(queuedLoads).toEqual([obsolete.options]);
    expect(queuedLoads[0].peaks).toBe(peaks);
    expect(queuedLoads[0].duration).toBe(12);
    expect(queuedLoads[0].fetchParams?.signal?.aborted).toBe(true);
    expect(obsolete.load).not.toHaveBeenCalled();
    expect(current.load).toHaveBeenCalledExactlyOnceWith(
      nextUrl,
      nextPeaks,
      24,
    );
    expect(create).toHaveBeenCalledTimes(2);

    unmount();
    expect(current.options.fetchParams?.signal?.aborted).toBe(true);
    expect(current.destroy).toHaveBeenCalledOnce();
  });

  it('uses the latest error callback without recreating or reloading', () => {
    const firstOnError = vi.fn();
    const nextOnError = vi.fn();
    const { rerender } = render(
      <NativeAudioWaveform {...props} onError={firstOnError} />,
    );
    const error = new Error('load failed');
    act(() => instances[0].emitError(error));
    expect(firstOnError).toHaveBeenCalledExactlyOnceWith(error);

    rerender(<NativeAudioWaveform {...props} onError={nextOnError} />);
    act(() => instances[0].emitError(error));
    expect(nextOnError).toHaveBeenCalledExactlyOnceWith(error);
    expect(firstOnError).toHaveBeenCalledOnce();

    rerender(<NativeAudioWaveform {...props} />);
    expect(() => act(() => instances[0].emitError(error))).not.toThrow();
    expect(nextOnError).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(instances[0].load).not.toHaveBeenCalled();
    expect(instances[0].on).toHaveBeenCalledOnce();
    expect(instances[0].destroy).not.toHaveBeenCalled();
  });

  it('reports an error event once and consumes the load rejection', async () => {
    const onError = vi.fn();
    const { rerender } = render(
      <NativeAudioWaveform {...props} onError={onError} />,
    );
    const instance = instances[0];
    const error = new Error('load failed');
    instance.load.mockImplementationOnce(() => {
      instance.emitError(error);
      return Promise.reject(error);
    });
    await act(async () => {
      rerender(
        <NativeAudioWaveform {...props} onError={onError} reloadKey={1} />,
      );
    });
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(instance.destroy).not.toHaveBeenCalled();

    instance.load.mockRejectedValueOnce(new Error('aborted without event'));
    await act(async () => {
      rerender(
        <NativeAudioWaveform {...props} onError={onError} reloadKey={2} />,
      );
    });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('recreates only for media and interaction changes, preserving the container', () => {
    const { container, rerender } = render(<NativeAudioWaveform {...props} />);
    const element = container.firstElementChild;
    const nextMedia = document.createElement('audio');
    rerender(<NativeAudioWaveform {...props} media={nextMedia} />);
    rerender(<NativeAudioWaveform {...props} interact media={nextMedia} />);

    expect(create).toHaveBeenCalledTimes(3);
    expect(container.firstElementChild).toBe(element);
    for (const instance of instances.slice(0, -1)) {
      expect(instance.options.fetchParams?.signal?.aborted).toBe(true);
      expect(instance.unsubscribe).toHaveBeenCalledOnce();
      expect(instance.destroy).toHaveBeenCalledOnce();
    }
    expect(instances[2].options).toMatchObject({
      media: nextMedia,
      duration: 12,
      peaks,
      interact: true,
    });
    expect(instances[2].options.fetchParams?.signal?.aborted).toBe(false);
  });

  it('clears an obsolete owner while pending and creates only once ready', () => {
    const { rerender } = render(<NativeAudioWaveform {...props} />);
    const nextMedia = document.createElement('audio');
    rerender(
      <NativeAudioWaveform {...props} media={nextMedia} ready={false} />,
    );
    expect(instances[0].destroy).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();

    rerender(<NativeAudioWaveform {...props} media={nextMedia} />);
    expect(create).toHaveBeenCalledTimes(2);
    expect(instances[1].options.media).toBe(nextMedia);
    expect(instances[1].load).not.toHaveBeenCalled();
  });
});
