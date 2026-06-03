import { describe, expect, it, vi } from 'vitest';

import {
  attemptPlayback,
  isExpectedPlaybackError,
} from '@/lib/media-playback';

describe('media-playback', () => {
  describe('isExpectedPlaybackError', () => {
    it('treats common browser playback names as expected', () => {
      expect(
        isExpectedPlaybackError(new DOMException('Denied', 'NotAllowedError')),
      ).toBe(true);
      expect(
        isExpectedPlaybackError(new DOMException('Aborted', 'AbortError')),
      ).toBe(true);
      expect(
        isExpectedPlaybackError(
          new DOMException('Unsupported', 'NotSupportedError'),
        ),
      ).toBe(true);
    });

    it('treats common playback messages as expected', () => {
      expect(
        isExpectedPlaybackError(
          new Error('play() can only be initiated by a user gesture.'),
        ),
      ).toBe(true);
      expect(
        isExpectedPlaybackError(
          new Error(
            'The play() request was interrupted by a call to pause().',
          ),
        ),
      ).toBe(true);
    });

    it('does not treat unrelated errors as expected', () => {
      expect(isExpectedPlaybackError(new Error('boom'))).toBe(false);
    });
  });

  describe('attemptPlayback', () => {
    it('returns true on successful playback', async () => {
      await expect(
        attemptPlayback(() => Promise.resolve()),
      ).resolves.toBe(true);
    });

    it('swallows expected playback errors and calls failure handler', async () => {
      const onFailure = vi.fn();

      await expect(
        attemptPlayback(
          () =>
            Promise.reject(
              new DOMException('Denied', 'NotAllowedError'),
            ),
          onFailure,
        ),
      ).resolves.toBe(false);

      expect(onFailure).toHaveBeenCalledTimes(1);
    });

    it('returns false for unexpected playback errors', async () => {
      const onFailure = vi.fn();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        attemptPlayback(() => Promise.reject(new Error('boom')), onFailure),
      ).resolves.toBe(false);

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });
  });
});
