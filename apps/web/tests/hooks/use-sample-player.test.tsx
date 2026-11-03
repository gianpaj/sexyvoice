// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { avatarColorClass } from '@/components/call/character-avatar';
import {
  SamplePlayerProvider,
  useSamplePlayer,
} from '@/hooks/use-sample-player';

class FakeAudio {
  static instances: FakeAudio[] = [];
  src = '';
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  constructor() {
    FakeAudio.instances.push(this);
  }
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <SamplePlayerProvider>{children}</SamplePlayerProvider>
);

describe('useSamplePlayer', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays one sample at a time through a shared audio element', () => {
    const { result } = renderHook(() => useSamplePlayer(), { wrapper });

    act(() => result.current.toggle('a', '/a.mp3'));
    expect(result.current.playingKey).toBe('a');
    act(() => result.current.toggle('b', '/b.mp3'));

    expect(result.current.playingKey).toBe('b');
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toBe('/b.mp3');
  });

  it('stops when the playing key is toggled again or the sample ends', () => {
    const { result } = renderHook(() => useSamplePlayer(), { wrapper });

    act(() => result.current.toggle('a', '/a.mp3'));
    act(() => result.current.toggle('a', '/a.mp3'));
    expect(result.current.playingKey).toBeNull();

    act(() => result.current.toggle('b', '/b.mp3'));
    act(() => FakeAudio.instances[0].onended?.());
    expect(result.current.playingKey).toBeNull();
  });

  it.each(['stop', 'switch'])(
    'ignores an interrupted play rejection after %s and replay',
    async (action) => {
      const { result } = renderHook(() => useSamplePlayer(), { wrapper });
      act(() => result.current.toggle('a', '/a.mp3'));
      const audio = FakeAudio.instances[0];
      let rejectPlayback: (error: Error) => void = () => {};
      audio.play.mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectPlayback = reject;
          }),
      );
      act(() => result.current.toggle('pending', '/pending.mp3'));
      act(() => {
        if (action === 'stop') result.current.stop();
        else result.current.toggle('b', '/b.mp3');
      });
      act(() => result.current.toggle('pending', '/pending.mp3'));

      await act(async () =>
        rejectPlayback(new DOMException('Playback interrupted', 'AbortError')),
      );

      expect(result.current.playingKey).toBe('pending');
      act(() => audio.onended?.());
      expect(result.current.playingKey).toBeNull();
    },
  );

  it.each(['onended', 'onerror'] as const)(
    'ignores an old %s callback after replaying the same sample',
    (event) => {
      const { result } = renderHook(() => useSamplePlayer(), { wrapper });
      act(() => result.current.toggle('a', '/a.mp3'));
      const oldCallback = FakeAudio.instances[0][event];
      act(() => result.current.stop());
      act(() => result.current.toggle('a', '/a.mp3'));

      act(() => oldCallback?.());

      expect(result.current.playingKey).toBe('a');
    },
  );

  it('clears the playing key when the active play request fails', async () => {
    const { result } = renderHook(() => useSamplePlayer(), { wrapper });
    act(() => result.current.toggle('a', '/a.mp3'));
    const audio = FakeAudio.instances[0];
    audio.play.mockRejectedValueOnce(
      new DOMException('Unsupported audio', 'NotSupportedError'),
    );

    await act(async () => result.current.toggle('b', '/b.mp3'));

    expect(result.current.playingKey).toBeNull();
  });

  it('clears the playing key when the active sample has a media error', () => {
    const { result } = renderHook(() => useSamplePlayer(), { wrapper });
    act(() => result.current.toggle('a', '/a.mp3'));

    act(() => FakeAudio.instances[0].onerror?.());

    expect(result.current.playingKey).toBeNull();
  });

  it('ignores samples without a URL', () => {
    const { result } = renderHook(() => useSamplePlayer(), { wrapper });

    act(() => result.current.toggle('a', null));

    expect(result.current.playingKey).toBeNull();
    expect(FakeAudio.instances).toHaveLength(0);
  });
});

describe('avatarColorClass', () => {
  it('returns the same color for the same seed', () => {
    expect(avatarColorClass('9f521791-9ee4')).toBe(
      avatarColorClass('9f521791-9ee4'),
    );
    expect(avatarColorClass('')).toMatch(/^bg-/);
  });
});
