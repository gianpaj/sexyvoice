// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LivekitSpike } from '@/components/call/livekit-spike';
import messages from '@/messages/en.json';

const sdk = vi.hoisted(() => ({
  rooms: [] as any[],
  transcripts: [] as any[],
}));
vi.mock('@livekit/components-react', async () => {
  const { createContext } = await import('react');
  return {
    RoomContext: createContext(null),
    RoomAudioRenderer: () => null,
    useTranscriptions: () => sdk.transcripts,
  };
});
vi.mock('livekit-client', () => ({
  RoomEvent: {
    ParticipantConnected: 'participant',
    ParticipantAttributesChanged: 'attributes',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
  },
  Room: class {
    listeners = new Map<string, (...args: any[]) => void>();
    remoteParticipants = new Map();
    localParticipant = {
      identity: 'spike-user-test',
      performRpc: vi.fn().mockResolvedValue('{}'),
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      sendText: vi.fn().mockResolvedValue({ id: 'typed-1', timestamp: 1 }),
    };
    startAudio = vi.fn().mockResolvedValue(undefined);
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    constructor() {
      sdk.rooms.push(this);
    }
    on(name: string, callback: (...args: any[]) => void) {
      this.listeners.set(name, callback);
      return this;
    }
    emit(name: string, ...args: any[]) {
      this.listeners.get(name)?.(...args);
    }
  },
}));
const jsAgent = {
  identity: 'agent-js',
  attributes: {
    'sv.spike.runtime': 'agents-js-spike',
    'lk.agent.state': 'listening',
  },
};
function view(audioReferenceId?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LivekitSpike audioReferenceId={audioReferenceId} />
    </NextIntlClientProvider>,
  );
}
async function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
  await waitFor(() => expect(sdk.rooms[0].connect).toHaveBeenCalled());
  return sdk.rooms[0];
}
async function connect() {
  const room = await start();
  await act(async () => room.emit('participant', jsAgent));
  await screen.findByText('In call');
  return room;
}
beforeEach(() => {
  sdk.rooms = [];
  sdk.transcripts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        runtime: 'agents-js-spike',
        url: 'wss://test',
        accessToken: 'js-token',
      }),
    }),
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('JS browser call', () => {
  it('passes the saved voice UUID to the token route', async () => {
    const audioReferenceId = '63765019-12dc-46b6-85e3-dd8b5238c9a0';
    view(audioReferenceId);
    await start();
    expect(fetch).toHaveBeenCalledWith('/api/voice-spike/call-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioReferenceId }),
    });
  });
  it.each([
    [
      'Mozilla/5.0 Firefox/159.0',
      { rtcConfig: { bundlePolicy: 'max-bundle' } },
    ],
    ['Mozilla/5.0 Chrome/142.0.0.0 Safari/537.36', undefined],
    ['Mozilla/5.0 Version/26.0 Safari/605.1.15', undefined],
    ['Mozilla/5.0 FxiOS/159.0 Mobile/15E148 Safari/605.1.15', undefined],
  ])(
    'uses the expected connection options for %s',
    async (userAgent, options) => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
      view();
      const room = await connect();
      expect(room.connect).toHaveBeenCalledWith(
        'wss://test',
        'js-token',
        options,
      );
    },
  );
  it('requests only the JS route and waits for the JS runtime before opening the microphone', async () => {
    view();
    const room = await start();
    expect(fetch).toHaveBeenCalledWith('/api/voice-spike/call-token', {
      method: 'POST',
    });
    await act(async () =>
      room.emit('participant', { identity: 'python', attributes: {} }),
    );
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    await act(async () => room.emit('participant', jsAgent));
    await screen.findByText('In call');
    expect(room.localParticipant.performRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationIdentity: 'agent-js',
        method: 'sv.spike.mute',
        payload: '{"muted":false}',
      }),
    );
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
    );
  });
  it('sends typed turns into the call and displays streamed text with a thinking state', async () => {
    view();
    const room = await connect();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Remember the blue bicycle' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Remember the blue bicycle');
    expect(room.localParticipant.sendText).toHaveBeenCalledWith(
      'Remember the blue bicycle',
      { topic: 'lk.chat' },
    );
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
    sdk.transcripts = [
      {
        text: 'A blue bicycle.',
        participantInfo: { identity: 'agent-js' },
        streamInfo: { id: 'reply', timestamp: 2 },
      },
    ];
    await act(async () =>
      room.emit(
        'attributes',
        {},
        {
          ...jsAgent,
          attributes: { ...jsAgent.attributes, 'lk.agent.state': 'speaking' },
        },
      ),
    );
    await screen.findByText('A blue bicycle.');
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
  });
  it('mutes the microphone and agent input, preserves mute on reconnect, and closes on mute failure', async () => {
    view();
    const room = await connect();
    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));
    await screen.findByRole('button', { name: 'Unmute microphone' });
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(room.localParticipant.performRpc).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: '{"muted":true}' }),
    );
    await act(async () => {
      room.emit('reconnecting');
      room.emit('reconnected');
    });
    await screen.findByText('In call');
    expect(room.localParticipant.performRpc).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: '{"muted":true}' }),
    );
    room.localParticipant.performRpc.mockRejectedValueOnce(
      new Error('network'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    await waitFor(() => expect(room.disconnect).toHaveBeenCalled());
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
  });
  it('disconnects when the page unmounts or the user cancels connection', async () => {
    const first = view();
    const room = await start();
    first.unmount();
    expect(room.disconnect).toHaveBeenCalled();
    sdk.rooms = [];
    view();
    const second = await start();
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    await waitFor(() => expect(second.disconnect).toHaveBeenCalled());
    await act(async () => second.emit('participant', jsAgent));
    expect(second.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  });
  it('waits for media connection before sending the agent handshake', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    const room = sdk.rooms[0];
    let resolveConnection!: () => void;
    room.connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConnection = resolve;
        }),
    );
    await waitFor(() => expect(room.connect).toHaveBeenCalled());
    room.remoteParticipants.set(jsAgent.identity, jsAgent);
    await act(async () => room.emit('participant', jsAgent));
    expect(room.localParticipant.performRpc).not.toHaveBeenCalled();
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    await act(async () => resolveConnection());
    await screen.findByText('In call');
    expect(room.localParticipant.performRpc).toHaveBeenCalledTimes(1);
  });
  it('allows transport recovery before the JS agent is ready', async () => {
    view();
    const room = await start();
    await act(async () => {
      room.emit('reconnecting');
      room.emit('reconnected');
    });
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(room.localParticipant.performRpc).not.toHaveBeenCalled();
    await act(async () => room.emit('participant', jsAgent));
    await screen.findByText('In call');
  });
  it('reports a connection failure when WebRTC has not connected by the startup deadline', async () => {
    view();
    const first = await start();
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    await act(async () => {});
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    const pending = sdk.rooms[1];
    pending.connect.mockImplementation(() => new Promise(() => {}));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(pending.disconnect).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.voiceSpike.connectError,
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      messages.voiceSpike.workerMissing,
    );
    expect(pending.disconnect).toHaveBeenCalled();
    expect(
      pending.localParticipant.setMicrophoneEnabled,
    ).not.toHaveBeenCalled();
    expect(first.disconnect).toHaveBeenCalled();
  });
  it('times out a missing JS worker without enabling the microphone', async () => {
    view();
    const room = await start();
    vi.useFakeTimers();
    // The connection deadline starts on the call gesture, so start another call under the fake clock.
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.voiceSpike.workerMissing,
    );
    expect(sdk.rooms[1].disconnect).toHaveBeenCalled();
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  });
});
