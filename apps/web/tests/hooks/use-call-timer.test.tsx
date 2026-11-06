// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { ConnectionState } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const assistant = vi.hoisted(() => ({ state: 'connecting' }));
vi.mock('@livekit/components-react', () => ({
  useVoiceAssistant: () => assistant,
}));

import { useCallTimer } from '@/hooks/use-call-timer';

beforeEach(() => {
  vi.useFakeTimers();
  assistant.state = 'connecting';
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useCallTimer', () => {
  it('starts when the agent is ready, not when the room connects', () => {
    const { result, rerender } = renderHook(
      ({ connection }) => useCallTimer(connection),
      { initialProps: { connection: ConnectionState.Connected } },
    );

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.formattedTime).toBe('00:00');
    expect(result.current.isRunning).toBe(false);

    assistant.state = 'speaking';
    rerender({ connection: ConnectionState.Connected });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.formattedTime).toBe('00:03');
  });

  it('keeps counting while the agent restarts, until the room disconnects', () => {
    assistant.state = 'listening';
    const { result, rerender } = renderHook(
      ({ connection }) => useCallTimer(connection),
      { initialProps: { connection: ConnectionState.Connected } },
    );
    act(() => vi.advanceTimersByTime(2000));

    assistant.state = 'initializing';
    rerender({ connection: ConnectionState.Connected });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.formattedTime).toBe('00:04');

    rerender({ connection: ConnectionState.Disconnected });
    expect(result.current.formattedTime).toBe('00:00');
    expect(result.current.isRunning).toBe(false);
  });
});
