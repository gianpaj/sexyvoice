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

import { LiveKitVoiceChat } from '@/components/call/livekit-voice-chat';
import messages from '@/messages/en.json';

const sdk = vi.hoisted(() => ({
  rooms: [] as any[],
  createLocalAudioTrack: vi.fn(),
}));
vi.mock('@livekit/components-react', async () => {
  const { createContext } = await import('react');
  return {
    RoomContext: createContext(null),
    RoomAudioRenderer: () => null,
  };
});
vi.mock('livekit-client', () => ({
  createLocalAudioTrack: sdk.createLocalAudioTrack,
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
      identity: 'voice-chat-user-test',
      performRpc: vi.fn().mockResolvedValue('{}'),
      publishTrack: vi.fn().mockResolvedValue(undefined),
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      sendText: vi.fn().mockResolvedValue({ id: 'typed-1', timestamp: 1 }),
    };
    registerTextStreamHandler = vi.fn();
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
    'sv.voice-chat.runtime': 'voice-chat-js',
    'lk.agent.state': 'listening',
  },
};
function view(audioReferenceId?: string, chatThreadId?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LiveKitVoiceChat
        audioReferenceId={audioReferenceId}
        chatThreadId={chatThreadId}
      />
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
  sdk.createLocalAudioTrack.mockReset().mockResolvedValue({ stop: vi.fn() });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        runtime: 'voice-chat-js',
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
    expect(fetch).toHaveBeenCalledWith('/api/voice-chat/call-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioReferenceId }),
    });
  });
  it('reuses the thread when the caller hangs up and redials', async () => {
    const conversationId = '60606060-6060-4060-8060-606060606061';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        runtime: 'voice-chat-js',
        url: 'wss://test',
        accessToken: 'js-token',
        conversationId,
      }),
    } as Response);
    view();
    await connect();
    expect(new URL(window.location.href).searchParams.get('conversation')).toBe(
      conversationId,
    );
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start call' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith('/api/voice-chat/call-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      }),
    );
    window.history.replaceState(null, '', '/');
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
      expect(sdk.createLocalAudioTrack).toHaveBeenCalledTimes(options ? 1 : 0);
    },
  );
  it('waits for Firefox microphone permission before connecting and publishes after the JS handshake', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Firefox/160.0');
    const microphone = { stop: vi.fn() };
    const capture = Promise.withResolvers<typeof microphone>();
    sdk.createLocalAudioTrack.mockReturnValueOnce(capture.promise);
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    const room = sdk.rooms[0];
    await waitFor(() => expect(sdk.createLocalAudioTrack).toHaveBeenCalled());
    expect(room.connect).not.toHaveBeenCalled();

    await act(async () => capture.resolve(microphone));
    expect(room.connect).toHaveBeenCalled();
    await act(async () =>
      room.emit('participant', { identity: 'python', attributes: {} }),
    );
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();

    const handshake = Promise.withResolvers<string>();
    room.localParticipant.performRpc.mockReturnValueOnce(handshake.promise);
    await act(async () => room.emit('participant', jsAgent));
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
    await act(async () => handshake.resolve('{}'));
    await screen.findByText('In call');
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(microphone);
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  });

  it('stops the Firefox microphone if permission arrives after hangup', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Firefox/160.0');
    const microphone = { stop: vi.fn() };
    const capture = Promise.withResolvers<typeof microphone>();
    sdk.createLocalAudioTrack.mockReturnValueOnce(capture.promise);
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    const room = sdk.rooms[0];
    await waitFor(() => expect(sdk.createLocalAudioTrack).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    await act(async () => capture.resolve(microphone));
    expect(microphone.stop).toHaveBeenCalledOnce();
    expect(room.connect).not.toHaveBeenCalled();
  });

  it('stops the unpublished Firefox microphone when ICE fails', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Firefox/160.0');
    const microphone = { stop: vi.fn() };
    sdk.createLocalAudioTrack.mockResolvedValueOnce(microphone);
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    const room = sdk.rooms[0];
    room.connect.mockRejectedValueOnce(new Error('ICE failed'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.voiceChat.connectError,
    );
    expect(microphone.stop).toHaveBeenCalledOnce();
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
  });

  it('requests only the JS route and waits for the JS runtime before opening the microphone', async () => {
    view();
    const room = await start();
    expect(fetch).toHaveBeenCalledWith('/api/voice-chat/call-token', {
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
        method: 'sv.voice-chat.mute',
        payload: '{"muted":false}',
      }),
    );
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
    );
  });
  it('keeps saved chat visible while connecting and appends live turns below it', async () => {
    const threadId = '60606060-6060-4060-8060-606060606061';
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        messages: [
          {
            id: 'saved-user',
            role: 'user',
            parts: [{ type: 'text', content: 'Earlier question' }],
          },
          {
            id: 'saved-assistant',
            role: 'assistant',
            parts: [{ type: 'text', content: 'Earlier answer' }],
          },
        ],
        activeRun: null,
        callActive: false,
      }),
    );
    view(undefined, threadId);
    await screen.findByText('Earlier answer');
    const room = await start();
    const turns = () =>
      Array.from(
        screen.getByRole('log').querySelectorAll('p'),
        (paragraph) => paragraph.textContent,
      );
    expect(turns()).toEqual(['Earlier question', 'Earlier answer']);
    await act(async () => room.emit('participant', jsAgent));
    await screen.findByText('In call');
    const [, onTranscript] = room.registerTextStreamHandler.mock.calls[0];
    await act(async () =>
      onTranscript(
        {
          info: { id: 'reply', timestamp: 1 },
          async *[Symbol.asyncIterator]() {
            yield 'Spoken reply';
          },
        },
        { identity: 'agent-js' },
      ),
    );
    expect(turns()).toEqual([
      'Earlier question',
      'Earlier answer',
      'Spoken reply',
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
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
    const [topic, onTranscript] = room.registerTextStreamHandler.mock.calls[0];
    expect(topic).toBe('lk.transcription');
    await act(async () =>
      onTranscript(
        {
          info: { id: 'reply', timestamp: 2 },
          async *[Symbol.asyncIterator]() {
            yield 'A blue ';
            yield 'bicycle.';
            throw new Error(
              'Room disconnected in the middle of receiving data',
            );
          },
        },
        { identity: 'agent-js' },
      ),
    );
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
      messages.voiceChat.connectError,
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      messages.voiceChat.workerMissing,
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
      messages.voiceChat.workerMissing,
    );
    expect(sdk.rooms[1].disconnect).toHaveBeenCalled();
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  });
});
