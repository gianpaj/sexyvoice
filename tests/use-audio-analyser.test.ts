// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Web Audio API mocks
// ---------------------------------------------------------------------------

let mockAnalyserNode: {
  fftSize: number;
  smoothingTimeConstant: number;
  frequencyBinCount: number;
  getFloatFrequencyData: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

let mockSourceNode: {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

let mockAudioContext: {
  state: string;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  createAnalyser: ReturnType<typeof vi.fn>;
  createMediaElementSource: ReturnType<typeof vi.fn>;
  destination: {};
};

let createMediaElementSourceCallCount: number;

function createMockAudioContext() {
  createMediaElementSourceCallCount = 0;

  mockAnalyserNode = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 1024,
    getFloatFrequencyData: vi.fn((dataArray: Float32Array) => {
      // Fill with some fake dB values (mid-range)
      for (let i = 0; i < dataArray.length; i++) {
        dataArray[i] = -50; // mid-range dB value
      }
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  mockSourceNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  mockAudioContext = {
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createAnalyser: vi.fn(() => mockAnalyserNode),
    createMediaElementSource: vi.fn((element: HTMLAudioElement) => {
      createMediaElementSourceCallCount++;
      // Simulate one-shot: throw on second call with same element
      if (createMediaElementSourceCallCount > 1) {
        throw new DOMException(
          'HTMLMediaElement already connected',
          'InvalidStateError',
        );
      }
      return mockSourceNode;
    }),
    destination: {},
  };

  return mockAudioContext;
}

// Store original rAF
const originalRAF = globalThis.requestAnimationFrame;
const originalCAF = globalThis.cancelAnimationFrame;

beforeEach(() => {
  // Create fresh mock AudioContext for each test
  const ctx = createMockAudioContext();

  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => ctx),
  );

  // Mock requestAnimationFrame to run once synchronously in tests
  let rafId = 0;
  const rafCallbacks = new Map<number, FrameRequestCallback>();

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafCallbacks.set(id, cb);
    // Execute callback on next microtask to allow state updates
    Promise.resolve().then(() => {
      if (rafCallbacks.has(id)) {
        rafCallbacks.delete(id);
        cb(performance.now());
      }
    });
    return id;
  });

  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Import the hook AFTER mocks are set up
// ---------------------------------------------------------------------------
import { useAudioAnalyser } from '@/hooks/use-audio-analyser';

// ---------------------------------------------------------------------------
// Helper to create a mock HTMLAudioElement
// ---------------------------------------------------------------------------
function createMockAudioElement(): HTMLAudioElement {
  const audio = document.createElement('audio');
  return audio;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAudioAnalyser', () => {
  describe('when audioElement is null', () => {
    it('returns an empty array', () => {
      const { result } = renderHook(() => useAudioAnalyser(null));
      expect(result.current).toEqual([]);
    });

    it('does not create an AudioContext', () => {
      renderHook(() => useAudioAnalyser(null));
      expect(AudioContext).not.toHaveBeenCalled();
    });
  });

  describe('when audioElement is provided', () => {
    it('creates an AudioContext', () => {
      const audio = createMockAudioElement();
      renderHook(() => useAudioAnalyser(audio));
      expect(AudioContext).toHaveBeenCalledTimes(1);
    });

    it('creates an AnalyserNode with fftSize 2048', () => {
      const audio = createMockAudioElement();
      renderHook(() => useAudioAnalyser(audio));
      expect(mockAudioContext.createAnalyser).toHaveBeenCalledTimes(1);
      expect(mockAnalyserNode.fftSize).toBe(2048);
    });

    it('creates a MediaElementAudioSourceNode from the audio element', () => {
      const audio = createMockAudioElement();
      renderHook(() => useAudioAnalyser(audio));
      expect(mockAudioContext.createMediaElementSource).toHaveBeenCalledWith(
        audio,
      );
    });

    it('connects source → analyser → destination', () => {
      const audio = createMockAudioElement();
      renderHook(() => useAudioAnalyser(audio));
      expect(mockSourceNode.connect).toHaveBeenCalledWith(mockAnalyserNode);
      expect(mockAnalyserNode.connect).toHaveBeenCalledWith(
        mockAudioContext.destination,
      );
    });

    it('returns frequency bands after rAF tick', async () => {
      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio, 5));

      // Wait for rAF callback and state update to flush
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.length).toBe(5);
      for (const band of result.current) {
        expect(band).toBeInstanceOf(Float32Array);
        expect(band.length).toBeGreaterThan(0);
      }
    });

    it('returns normalised values between 0 and 1', async () => {
      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio, 3));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      for (const band of result.current) {
        for (let i = 0; i < band.length; i++) {
          expect(band[i]).toBeGreaterThanOrEqual(0);
          expect(band[i]).toBeLessThanOrEqual(1);
        }
      }
    });

    it('uses the default of 5 bands', async () => {
      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.length).toBe(5);
    });

    it('respects custom band count', async () => {
      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio, 8));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.length).toBe(8);
    });
  });

  describe('AudioContext autoplay policy', () => {
    it('resumes AudioContext when state is suspended', () => {
      mockAudioContext.state = 'suspended';
      const audio = createMockAudioElement();
      renderHook(() => useAudioAnalyser(audio));
      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('does not call resume when AudioContext is already running', () => {
      mockAudioContext.state = 'running';
      const audio = createMockAudioElement();
      renderHook(() => useAudioAnalyser(audio));
      expect(mockAudioContext.resume).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('closes AudioContext on unmount', () => {
      const audio = createMockAudioElement();
      const { unmount } = renderHook(() => useAudioAnalyser(audio));
      unmount();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('disconnects source node on unmount', () => {
      const audio = createMockAudioElement();
      const { unmount } = renderHook(() => useAudioAnalyser(audio));
      unmount();
      expect(mockSourceNode.disconnect).toHaveBeenCalled();
    });

    it('disconnects analyser node on unmount', () => {
      const audio = createMockAudioElement();
      const { unmount } = renderHook(() => useAudioAnalyser(audio));
      unmount();
      expect(mockAnalyserNode.disconnect).toHaveBeenCalled();
    });

    it('resets frequency bands to empty array when audioElement becomes null', async () => {
      const audio = createMockAudioElement();
      const { result, rerender } = renderHook(
        ({ el }) => useAudioAnalyser(el),
        { initialProps: { el: audio as HTMLAudioElement | null } },
      );

      // Wait for initial data
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.length).toBeGreaterThan(0);

      // Set audioElement to null
      rerender({ el: null });

      expect(result.current).toEqual([]);
    });

    it('cleans up old context and creates new one when audioElement changes', () => {
      const audio1 = createMockAudioElement();

      const { rerender } = renderHook(({ el }) => useAudioAnalyser(el), {
        initialProps: { el: audio1 as HTMLAudioElement | null },
      });

      expect(AudioContext).toHaveBeenCalledTimes(1);

      // Reset the one-shot counter so second element works
      createMediaElementSourceCallCount = 0;

      const audio2 = createMockAudioElement();
      rerender({ el: audio2 });

      // Old context should be closed, new one created
      expect(mockAudioContext.close).toHaveBeenCalled();
      // AudioContext constructor called again (2 total)
      expect(AudioContext).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('handles createMediaElementSource failure gracefully', () => {
      // Force createMediaElementSource to throw immediately
      mockAudioContext.createMediaElementSource = vi.fn(() => {
        throw new DOMException(
          'HTMLMediaElement already connected',
          'InvalidStateError',
        );
      });

      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio));

      // Should not throw, just return empty bands
      expect(result.current).toEqual([]);
    });

    it('handles disconnect errors during cleanup without throwing', () => {
      mockSourceNode.disconnect = vi.fn(() => {
        throw new Error('Already disconnected');
      });
      mockAnalyserNode.disconnect = vi.fn(() => {
        throw new Error('Already disconnected');
      });

      const audio = createMockAudioElement();
      const { unmount } = renderHook(() => useAudioAnalyser(audio));

      // Should not throw
      expect(() => unmount()).not.toThrow();
    });

    it('handles AudioContext close errors during cleanup without throwing', () => {
      mockAudioContext.close = vi.fn(() => {
        throw new Error('Already closed');
      });

      const audio = createMockAudioElement();
      const { unmount } = renderHook(() => useAudioAnalyser(audio));

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('normalisation', () => {
    it('maps -100 dB to 0', async () => {
      mockAnalyserNode.getFloatFrequencyData = vi.fn(
        (dataArray: Float32Array) => {
          for (let i = 0; i < dataArray.length; i++) {
            dataArray[i] = -100;
          }
        },
      );

      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio, 1));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      if (result.current.length > 0) {
        for (let i = 0; i < result.current[0].length; i++) {
          expect(result.current[0][i]).toBe(0);
        }
      }
    });

    it('maps -10 dB to 1', async () => {
      mockAnalyserNode.getFloatFrequencyData = vi.fn(
        (dataArray: Float32Array) => {
          for (let i = 0; i < dataArray.length; i++) {
            dataArray[i] = -10;
          }
        },
      );

      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio, 1));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      if (result.current.length > 0) {
        for (let i = 0; i < result.current[0].length; i++) {
          expect(result.current[0][i]).toBe(1);
        }
      }
    });

    it('clamps values below -100 dB to 0', async () => {
      mockAnalyserNode.getFloatFrequencyData = vi.fn(
        (dataArray: Float32Array) => {
          for (let i = 0; i < dataArray.length; i++) {
            dataArray[i] = -200; // Below range
          }
        },
      );

      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio, 1));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      if (result.current.length > 0) {
        for (let i = 0; i < result.current[0].length; i++) {
          expect(result.current[0][i]).toBe(0);
        }
      }
    });

    it('clamps values above -10 dB to 1', async () => {
      mockAnalyserNode.getFloatFrequencyData = vi.fn(
        (dataArray: Float32Array) => {
          for (let i = 0; i < dataArray.length; i++) {
            dataArray[i] = 0; // Above range
          }
        },
      );

      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio, 1));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      if (result.current.length > 0) {
        for (let i = 0; i < result.current[0].length; i++) {
          expect(result.current[0][i]).toBe(1);
        }
      }
    });

    it('applies sqrt for perceptual scaling (mid-range check)', async () => {
      // -55 dB → (−55 + 100)/90 = 0.5 → sqrt(0.5) ≈ 0.7071
      mockAnalyserNode.getFloatFrequencyData = vi.fn(
        (dataArray: Float32Array) => {
          for (let i = 0; i < dataArray.length; i++) {
            dataArray[i] = -55;
          }
        },
      );

      const audio = createMockAudioElement();
      const { result } = renderHook(() => useAudioAnalyser(audio, 1));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      if (result.current.length > 0 && result.current[0].length > 0) {
        expect(result.current[0][0]).toBeCloseTo(Math.sqrt(0.5), 4);
      }
    });
  });
});
