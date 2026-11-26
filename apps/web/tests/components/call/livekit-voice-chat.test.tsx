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
import { prepareCallFromCard } from '@/components/call/voice-chat-room';
import { defaultSessionConfig } from '@/data/default-config';
import { ModelId } from '@/data/models';
import messages from '@/messages/en.json';

const sdk = vi.hoisted(() => ({
  rooms: [] as any[],
  push: vi.fn(),
  createLocalAudioTrack: vi.fn(),
}));
vi.mock('@/lib/i18n/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/i18n/navigation')>()),
  useRouter: () => ({ push: sdk.push }),
}));
vi.mock('@livekit/components-react', async () => {
  const { createContext } = await import('react');
  return {
    RoomContext: createContext(null),
    RoomAudioRenderer: () => <span data-testid="room-audio" />,
    useConnectionState: () => 'connected',
    useLocalParticipant: () => ({}),
    useVoiceAssistant: () => ({ state: 'listening' }),
  };
});
vi.mock('livekit-client', () => ({
  ConnectionState: { Connected: 'connected' },
  createLocalAudioTrack: sdk.createLocalAudioTrack,
  RoomEvent: {
    ParticipantConnected: 'participant',
    ParticipantDisconnected: 'participantDisconnected',
    ParticipantAttributesChanged: 'attributes',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
  },
  Room: class {
    name = `voice-chat-test-${sdk.rooms.length + 1}`;
    listeners = new Map<string, (...args: any[]) => void>();
    remoteParticipants = new Map();
    localParticipant = {
      identity: 'voice-chat-user-test',
      performRpc: vi.fn().mockResolvedValue('{}'),
      registerRpcMethod: vi.fn(),
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
vi.mock('@/components/call/in-call-view', () => ({
  AudioSettingsMenu: ({ disabled }: { disabled?: boolean }) => (
    <button disabled={disabled} type="button">
      Audio settings
    </button>
  ),
  RecordButton: ({ disabled }: { disabled?: boolean }) => (
    <button disabled={disabled} type="button">
      Record call
    </button>
  ),
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
  sdk.push.mockClear();
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
        screen
          .getByRole('log')
          .querySelectorAll('[data-slot="voice-chat-bubble"]'),
        (bubble) => bubble.textContent,
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

describe('Python Inworld call on the chat page', () => {
  async function startPythonCall(
    fromCard = false,
    openConversation = vi.fn().mockResolvedValue(null),
  ) {
    const conversationId = '60606060-6060-4060-8060-606060606061';
    const preset = {
      id: '63765019-12dc-46b6-85e3-dd8b5238c9a0',
      name: 'Test character',
      instructions: 'Talk naturally',
      sessionConfig: { ...defaultSessionConfig, model: ModelId.INWORLD_TTS },
    };
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).startsWith('/api/voice-chat/chat')
        ? Response.json({
            messages: [
              {
                id: 'earlier-turn',
                role: 'user',
                parts: [{ type: 'text', content: 'Earlier text' }],
              },
            ],
            activeRun: null,
            callActive: false,
          })
        : Response.json({
            runtime: 'voice-chat-python',
            url: 'wss://test',
            accessToken: 'python-token',
            conversationId,
          }),
    );
    if (fromCard) prepareCallFromCard().handOff(conversationId);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LiveKitVoiceChat
          characterName={preset.name}
          chatThreadId={conversationId}
          conversationId={conversationId}
          pythonCall={{ preset, language: 'en', openConversation }}
        />
      </NextIntlClientProvider>,
    );
    if (!fromCard) {
      await screen.findByText('Earlier text');
      const room = await start();
      return { room, conversationId };
    }
    const [room] = sdk.rooms;
    await waitFor(() => expect(room.connect).toHaveBeenCalled());
    return { room, conversationId };
  }

  async function admitPythonAgent(room: Awaited<ReturnType<typeof start>>) {
    room.localParticipant.performRpc.mockResolvedValue('{"ok":true}');
    await act(async () =>
      room.emit('participant', {
        identity: 'agent-python',
        attributes: {
          'sv.voice-chat.runtime': 'voice-chat-python',
          'lk.agent.state': 'listening',
        },
      }),
    );
  }

  it('dials once on arrival from a card and reuses its unlocked room', async () => {
    const { room, conversationId } = await startPythonCall(true);
    expect(sdk.rooms).toHaveLength(1);
    expect(room.startAudio).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      '/api/call-token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(conversationId),
      }),
    );
    await admitPythonAgent(room);
    expect(await screen.findByTestId('inworld-call-view')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    expect(await screen.findByTestId('call-ended-view')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Back to characters' }),
    ).toHaveAttribute('href', '/en/dashboard/call');
    expect(screen.getByRole('button', { name: 'Call again' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(await screen.findByTestId('inworld-chat-view')).toBeVisible();
    expect(screen.getByText('Earlier text')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled();
    expect(room.connect).toHaveBeenCalledOnce();
    window.history.replaceState(null, '', '/');
  });

  it('opens a fresh conversation when calling again from the summary', async () => {
    const freshId = '60606060-6060-4060-8060-606060606062';
    const openConversation = vi.fn().mockResolvedValue(freshId);
    const { room, conversationId } = await startPythonCall(
      true,
      openConversation,
    );
    await admitPythonAgent(room);
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    const callAgain = await screen.findByRole('button', { name: 'Call again' });
    await waitFor(() => expect(callAgain).toBeEnabled());
    fireEvent.click(callAgain);

    await waitFor(() =>
      expect(sdk.push).toHaveBeenCalledWith(
        `/dashboard/call?conversation=${freshId}`,
      ),
    );
    expect(openConversation).toHaveBeenCalledOnce();
    expect(sdk.rooms[1].startAudio).toHaveBeenCalledOnce();
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/call-token'),
    ).toHaveLength(1);
    expect(new URL(window.location.href).searchParams.get('conversation')).toBe(
      conversationId,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(await screen.findByText('Earlier text')).toBeVisible();
    window.history.replaceState(null, '', '/');
  });

  it('keeps the ended room and note when call feedback needs a retry', async () => {
    const { room } = await startPythonCall();
    const previousFetch = vi.mocked(fetch).getMockImplementation();
    const saveFeedback = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ rating: 'down' }))
      .mockResolvedValueOnce(Response.json({ rating: 'up' }));
    vi.mocked(fetch).mockImplementation((url, options) =>
      url === '/api/feedback'
        ? saveFeedback(JSON.parse(String(options?.body)))
        : previousFetch?.(url, options),
    );
    await admitPythonAgent(room);
    const roomName = room.name;
    room.name = '';
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));

    const rateCall = await screen.findByRole('button', { name: 'Rate call' });
    fireEvent.keyDown(rateCall, { key: 'Enter' });
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Leave feedback' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'What went wrong?' }),
    ).toBeVisible();
    const submit = screen.getByRole('button', { name: 'Send feedback' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Something else' }));
    const note = screen.getByRole('textbox', { name: 'Add a note (optional)' });
    fireEvent.change(note, { target: { value: 'The greeting repeated' } });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.feedback.ending,
    );
    expect(note).toHaveValue('The greeting repeated');
    fireEvent.click(submit);
    await screen.findByText(messages.feedback.thanks);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saveFeedback.mock.calls).toEqual([
      [
        {
          note: 'The greeting repeated',
          rating: 'down',
          reasonCode: 'other',
          target: { kind: 'call', roomName },
        },
      ],
      [
        {
          note: 'The greeting repeated',
          rating: 'down',
          reasonCode: 'other',
          target: { kind: 'call', roomName },
        },
      ],
    ]);
    fireEvent.keyDown(rateCall, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Good call' }));
    expect(saveFeedback).toHaveBeenLastCalledWith({
      rating: 'up',
      target: { kind: 'call', roomName },
    });
    window.history.replaceState(null, '', '/');
  });

  it('keeps the same call controls mounted until they are ready', async () => {
    vi.stubGlobal('MediaRecorder', vi.fn());
    vi.stubGlobal('AudioContext', vi.fn());
    const { room } = await startPythonCall();
    const controls = await Promise.all(
      [
        'Mute microphone',
        'Type instead of speaking',
        'Record call',
        'Audio settings',
      ].map((name) => screen.findByRole('button', { name })),
    );
    for (const control of controls) expect(control).toBeDisabled();
    expect(screen.getByRole('button', { name: 'End call' })).toBeEnabled();
    await admitPythonAgent(room);
    for (const control of controls) expect(control).toBeEnabled();
    window.history.replaceState(null, '', '/');
  });

  it('uses the linked token and preserves history while typing with the microphone off', async () => {
    const { room, conversationId } = await startPythonCall();
    expect(fetch).toHaveBeenCalledWith(
      '/api/call-token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(conversationId),
      }),
    );
    expect(room.connect).toHaveBeenCalledWith(
      'wss://test',
      'python-token',
      undefined,
    );
    await act(async () => room.emit('participant', jsAgent));
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();

    await admitPythonAgent(room);
    const keyboard = await screen.findByRole('button', {
      name: 'Type instead of speaking',
    });
    await waitFor(() => expect(keyboard).toBeEnabled());
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      true,
    );

    const muted = Promise.withResolvers<string>();
    room.localParticipant.performRpc.mockReturnValueOnce(muted.promise);
    fireEvent.click(keyboard);
    const composer = screen.getByRole('textbox', { name: 'Message' });
    expect(composer).toHaveFocus();
    fireEvent.change(composer, { target: { value: 'A typed reply' } });
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    await act(async () => muted.resolve('{"ok":true}'));
    expect(await screen.findByText('Mic off while you type')).toBeVisible();
    fireEvent.click(send);
    expect(await screen.findByText('A typed reply')).toBeVisible();
    expect(room.localParticipant.sendText).toHaveBeenCalledWith(
      'A typed reply',
      {
        topic: 'lk.chat',
        destinationIdentities: ['agent-python'],
      },
    );

    expect(await screen.findByText('Earlier text')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Hide conversation' }));
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull(),
    );
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      true,
    );
    window.history.replaceState(null, '', '/');
  });

  it('toggles the mic without closing the composer or losing the draft', async () => {
    const { room } = await startPythonCall();
    await admitPythonAgent(room);
    expect(
      screen.queryByRole('button', { name: 'Show conversation' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Turn speaker off' }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Type instead of speaking' }),
    );
    const composer = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(composer, { target: { value: 'Still here' } });
    const unmute = await screen.findByRole('button', {
      name: 'Unmute microphone',
    });
    await waitFor(() => expect(unmute).toBeEnabled());
    fireEvent.click(unmute);

    const mute = await screen.findByRole('button', { name: 'Mute microphone' });
    await waitFor(() => expect(mute).toBeEnabled());
    expect(composer).toBeVisible();
    expect(composer).toHaveValue('Still here');
    expect(composer).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByTestId('room-audio')).toBeInTheDocument();
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      true,
    );

    fireEvent.click(mute);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide conversation' }));
    await waitFor(() => expect(composer).not.toBeInTheDocument());
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );
    expect(
      screen.getByRole('button', { name: 'Unmute microphone' }),
    ).toBeEnabled();
  });
});
