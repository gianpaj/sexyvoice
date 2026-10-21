// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaveSurferOptions } from 'wavesurfer.js';

import { AUDIO_WAVEFORM_DEFAULTS } from '@/components/audio-waveform';
import { NativeAudioWaveform } from '@/components/native-audio-waveform';

const { instances, create } = vi.hoisted(() => {
  const instances: {
    options: WaveSurferOptions;
    on: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
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
  let media: HTMLAudioElement;
  const url = 'https://example.com/voice.mp3';

  beforeEach(() => {
    vi.clearAllMocks();
    instances.length = 0;
    media = document.createElement('audio');
    media.src = url;
  });

  afterEach(cleanup);

  it('renders into its own div using the supplied native media and exact defaults', () => {
    const { container } = render(
      <NativeAudioWaveform duration={12} media={media} url={url} />,
    );

    expect(create).toHaveBeenCalledExactlyOnceWith({
      ...AUDIO_WAVEFORM_DEFAULTS,
      container: container.firstElementChild,
      media,
      url,
      duration: 12,
      interact: false,
      fetchParams: { signal: expect.any(AbortSignal) },
    });
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
    expect(media.src).toBe(url);
  });

  it('unsubscribes, aborts, then destroys on unmount', () => {
    const onError = vi.fn();
    const { unmount } = render(
      <NativeAudioWaveform
        duration={12}
        media={media}
        onError={onError}
        url={url}
      />,
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

  it('gives StrictMode effect instances distinct signals and aborts only the obsolete one', () => {
    const { unmount } = render(
      <StrictMode>
        <NativeAudioWaveform duration={12} media={media} url={url} />
      </StrictMode>,
    );

    expect(create).toHaveBeenCalledTimes(2);
    const [obsolete, current] = instances;
    expect(obsolete.options.fetchParams?.signal).not.toBe(
      current.options.fetchParams?.signal,
    );
    expect(obsolete.options.fetchParams?.signal?.aborted).toBe(true);
    expect(obsolete.destroy).toHaveBeenCalledOnce();
    expect(current.options.fetchParams?.signal?.aborted).toBe(false);
    expect(current.destroy).not.toHaveBeenCalled();

    unmount();
    expect(current.options.fetchParams?.signal?.aborted).toBe(true);
    expect(current.destroy).toHaveBeenCalledOnce();
  });

  it('aborts the obsolete URL load and creates a fresh live signal', () => {
    const { rerender } = render(
      <NativeAudioWaveform duration={12} media={media} url={url} />,
    );
    const nextUrl = 'https://example.com/next.mp3';
    rerender(<NativeAudioWaveform duration={12} media={media} url={nextUrl} />);

    expect(create).toHaveBeenCalledTimes(2);
    expect(instances[0].options.fetchParams?.signal?.aborted).toBe(true);
    expect(instances[0].destroy).toHaveBeenCalledOnce();
    expect(instances[1].options.url).toBe(nextUrl);
    expect(instances[1].options.fetchParams?.signal?.aborted).toBe(false);
    expect(instances[1].options.fetchParams?.signal).not.toBe(
      instances[0].options.fetchParams?.signal,
    );
  });

  it('uses the latest error callback without recreating WaveSurfer', () => {
    const firstOnError = vi.fn();
    const nextOnError = vi.fn();
    const { rerender } = render(
      <NativeAudioWaveform
        duration={12}
        media={media}
        onError={firstOnError}
        url={url}
      />,
    );
    const error = new Error('load failed');
    act(() => instances[0].emitError(error));
    expect(firstOnError).toHaveBeenCalledExactlyOnceWith(error);

    rerender(
      <NativeAudioWaveform
        duration={12}
        media={media}
        onError={nextOnError}
        url={url}
      />,
    );
    act(() => instances[0].emitError(error));
    expect(nextOnError).toHaveBeenCalledExactlyOnceWith(error);
    expect(firstOnError).toHaveBeenCalledOnce();

    rerender(<NativeAudioWaveform duration={12} media={media} url={url} />);
    expect(() => act(() => instances[0].emitError(error))).not.toThrow();
    expect(nextOnError).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(instances[0].destroy).not.toHaveBeenCalled();
  });

  it('recreates for media, duration, and interaction changes', () => {
    const { rerender } = render(
      <NativeAudioWaveform duration={12} media={media} url={url} />,
    );
    const nextMedia = document.createElement('audio');
    rerender(<NativeAudioWaveform duration={12} media={nextMedia} url={url} />);
    rerender(<NativeAudioWaveform duration={24} media={nextMedia} url={url} />);
    rerender(
      <NativeAudioWaveform
        duration={24}
        interact
        media={nextMedia}
        url={url}
      />,
    );

    expect(create).toHaveBeenCalledTimes(4);
    for (const instance of instances.slice(0, -1)) {
      expect(instance.options.fetchParams?.signal?.aborted).toBe(true);
      expect(instance.destroy).toHaveBeenCalledOnce();
    }
    expect(instances[3].options).toMatchObject({
      media: nextMedia,
      duration: 24,
      interact: true,
    });
    expect(instances[3].options.fetchParams?.signal?.aborted).toBe(false);
  });
});
