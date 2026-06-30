import { describe, expect, it, vi } from 'vitest';

import {
  enableKrispNoiseFilterIfReady,
  isExpectedKrispNoiseFilterError,
  shouldEnableKrispNoiseFilter,
} from '@/components/call/krisp-noise-filter';

const liveMicrophonePublication = {
  track: {
    mediaStreamTrack: {
      readyState: 'live',
    },
  },
};

describe('Krisp noise filter guards', () => {
  it('enables Krisp only when the microphone media track is live', () => {
    expect(shouldEnableKrispNoiseFilter(liveMicrophonePublication)).toBe(true);
    expect(
      shouldEnableKrispNoiseFilter({
        track: { mediaStreamTrack: { readyState: 'ended' } },
      }),
    ).toBe(false);
    expect(shouldEnableKrispNoiseFilter({ track: null })).toBe(false);
  });

  it('ignores browser and Krisp readiness errors', () => {
    const endedTrackError = new Error('Track has ended');
    endedTrackError.name = 'InvalidAccessError';

    expect(isExpectedKrispNoiseFilterError(endedTrackError)).toBe(true);
    expect(isExpectedKrispNoiseFilterError('WASM_OR_WORKER_NOT_READY')).toBe(
      true,
    );
    expect(
      isExpectedKrispNoiseFilterError({
        message: 'Krisp WASM_OR_WORKER_NOT_READY',
        name: 'DOMException',
      }),
    ).toBe(true);
    expect(
      isExpectedKrispNoiseFilterError(
        new WebAssembly.CompileError(
          'WebAssembly.Module(): Compiling function failed: Wasm SIMD unsupported',
        ),
      ),
    ).toBe(true);
    expect(isExpectedKrispNoiseFilterError(new Error('boom'))).toBe(false);
  });

  it('does not call LiveKit until a live microphone track exists', async () => {
    const setNoiseFilterEnabled = vi.fn();

    await expect(
      enableKrispNoiseFilterIfReady({
        microphonePublication: { track: null },
        setNoiseFilterEnabled,
      }),
    ).resolves.toBe('skipped');

    expect(setNoiseFilterEnabled).not.toHaveBeenCalled();
  });

  it('catches expected enable failures instead of leaving unhandled rejections', async () => {
    const setNoiseFilterEnabled = vi
      .fn()
      .mockRejectedValue(new Error('Track has ended'));
    const onUnexpectedError = vi.fn();

    await expect(
      enableKrispNoiseFilterIfReady({
        microphonePublication: liveMicrophonePublication,
        onUnexpectedError,
        setNoiseFilterEnabled,
      }),
    ).resolves.toBe('ignored');

    expect(setNoiseFilterEnabled).toHaveBeenCalledWith(true);
    expect(onUnexpectedError).not.toHaveBeenCalled();
  });
});
