// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMultibandTrackVolume } from '@/hooks/use-multiband-track-volume';

describe('microphone volume lifecycle', () => {
  const contexts: {
    close: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    contexts.length = 0;
    vi.stubGlobal(
      'AudioContext',
      class {
        close = vi.fn().mockResolvedValue(undefined);
        disconnect = vi.fn();
        constructor() {
          contexts.push(this);
        }
        createMediaStreamSource() {
          return { connect: vi.fn(), disconnect: this.disconnect };
        }
        createAnalyser() {
          return {
            fftSize: 0,
            frequencyBinCount: 1024,
            getFloatFrequencyData: (data: Float32Array) => data.fill(-20),
          };
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('releases each context when the stream changes and on unmount', () => {
    const { rerender, unmount } = renderHook(
      ({ stream }) => useMultibandTrackVolume(stream),
      {
        initialProps: { stream: {} as MediaStream },
      },
    );
    act(() => vi.advanceTimersByTime(10));
    rerender({ stream: {} as MediaStream });
    expect(contexts[0].disconnect).toHaveBeenCalledOnce();
    expect(contexts[0].close).toHaveBeenCalledOnce();
    unmount();
    expect(contexts[1].close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
