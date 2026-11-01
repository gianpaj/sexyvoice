// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CallExperience } from '@/components/call/call-experience';
import { defaultSessionConfig } from '@/data/default-config';
import { ModelId } from '@/data/models';
import type { Preset } from '@/data/presets';
import type { DBVoice } from '@/data/voices';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';
import type { SavedCallVoice } from '@/lib/call-voices';
import messages from '@/messages/en.json';

const connection = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  shouldConnect: false,
  state: 'disconnected',
}));
const microphone = vi.hoisted(() => ({
  request: vi.fn(),
  status: 'unknown',
}));
const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
);
const routerPush = vi.hoisted(() => vi.fn());

vi.mock('@livekit/components-react', () => ({
  useConnectionState: () => connection.state,
}));
vi.mock('livekit-client', () => ({
  ConnectionState: {
    Connected: 'connected',
    Connecting: 'connecting',
    Disconnected: 'disconnected',
  },
}));
vi.mock('@/hooks/use-connection', () => ({
  useConnection: () => ({
    connect: connection.connect,
    disconnect: connection.disconnect,
    shouldConnect: connection.shouldConnect,
  }),
}));
vi.mock('@/hooks/use-call-timer', () => ({
  useCallTimer: () => ({ formattedTime: '01:42' }),
}));
vi.mock('@/hooks/use-microphone-permission', () => ({
  useMicrophonePermission: () => microphone,
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('next/dynamic', () => ({
  default: () =>
    function InCallView({ preset }: { preset: Preset }) {
      return <div data-testid="in-call-view">{preset.name}</div>;
    },
}));
vi.mock('next/image', () => ({
  default: ({ src }: { src: string }) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt="" height={56} src={src} width={56} />
  ),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/app/[lang]/tools/audio-converter/hooks/use-ffmpeg', () => ({
  useFFmpeg: () => ({ convert: vi.fn(), ensureLoaded: vi.fn() }),
}));
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: routerPush }),
}));

const featured: Preset = {
  id: '6f1d9c2a-0000-4000-8000-000000000001',
  image: 'lily.webp',
  instructions: '',
  isPublic: true,
  localizedDescriptions: { en: 'Shy, warm, and playful.' },
  name: 'Lily',
  sessionConfig: { ...defaultSessionConfig, voice: 'Ara' },
  voiceName: 'Ara',
  voiceSampleUrl: 'https://cdn.example.com/ara.mp3',
};

const own: Preset = {
  id: '6f1d9c2a-0000-4000-8000-000000000002',
  instructions: 'You are Marco, a patient Italian tutor.',
  isPublic: false,
  localizedDescriptions: { en: 'Patient Italian tutor' },
  localizedInstructions: { en: 'You are Marco, a patient Italian tutor.' },
  name: 'Marco',
  sessionConfig: { ...defaultSessionConfig, voice: 'Rex' },
  voiceName: 'Rex',
};

const callVoices = ['Ara', 'Rex'].map(
  (name, index): DBVoice => ({
    description: `${name} description`,
    feature: 'call',
    id: `voice-${name}`,
    language: 'en',
    model: 'grok',
    name,
    sample_url: `https://cdn.example.com/${name}.mp3`,
    sort_order: index,
    type: null,
  }),
);

const savedVoice: SavedCallVoice = {
  id: '6f1d9c2a-0000-4000-8000-0000000000aa',
  locale: 'en',
  name: 'My voice',
  provider: 'mistral',
};

const clonedVoiceId = '6f1d9c2a-0000-4000-8000-0000000000bb';
let fetchMock: ReturnType<typeof vi.fn>;

function renderExperience({
  customCharacters = [own],
  isPaidUser = true,
  returnFromClone = null,
}: {
  customCharacters?: Preset[];
  isPaidUser?: boolean;
  returnFromClone?: { voiceId: string | null } | null;
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlaygroundStateProvider
        defaultPresets={[featured]}
        initialCustomCharacters={customCharacters}
        initialState={{ selectedPresetId: featured.id }}
      >
        <CallExperience
          callVoices={callVoices}
          isPaidUser={isPaidUser}
          returnFromClone={returnFromClone}
          savedVoices={[savedVoice]}
        >
          <p>Footer</p>
        </CallExperience>
      </PlaygroundStateProvider>
    </NextIntlClientProvider>,
  );
}

const savedResponse = (body: Record<string, unknown>, id: string) => ({
  id,
  is_public: false,
  localized_descriptions: body.localizedDescriptions,
  name: body.name,
  prompts: { localized_prompts: body.localizedPrompts, prompt: body.prompt },
  session_config: body.sessionConfig,
  voices: { name: body.voiceName },
});

beforeEach(() => {
  window.history.replaceState({}, '', '/en/dashboard/call');
  connection.connect.mockReset().mockResolvedValue(undefined);
  connection.disconnect.mockReset().mockResolvedValue(undefined);
  connection.shouldConnect = false;
  connection.state = 'disconnected';
  microphone.request.mockReset().mockResolvedValue(true);
  microphone.status = 'unknown';
  toastMock.mockClear().mockReturnValue('toast-id');
  toastMock.dismiss.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  routerPush.mockClear();
  window.scrollTo = vi.fn();
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/clone-voice') {
      return Response.json({
        audioReferenceId: clonedVoiceId,
        provider: 'inworld',
      });
    }
    const body = JSON.parse(String(init.body));
    if (init.method === 'DELETE') return new Response(null, { status: 200 });
    return Response.json(savedResponse(body, body.id ?? 'new-character-id'), {
      status: body.id ? 200 : 201,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'MediaRecorder',
    Object.assign(vi.fn(), { isTypeSupported: () => true }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const lastPostBody = () => {
  const call = fetchMock.mock.calls.findLast(
    ([, init]) => (init as RequestInit).method === 'POST',
  );
  if (!call) throw new Error('No POST request was sent');
  return JSON.parse(String((call[1] as RequestInit).body));
};

describe('CallExperience picker', () => {
  it('lists own and featured characters with a Create card', () => {
    renderExperience();

    const ownSection = screen.getByRole('region', { name: 'Your characters' });
    expect(
      within(ownSection).getByRole('button', { name: /Create a character/ }),
    ).toBeInTheDocument();
    expect(
      within(ownSection).getByRole('button', { name: 'Open Marco' }),
    ).toBeInTheDocument();
    const featuredSection = screen.getByRole('region', { name: 'Featured' });
    expect(
      within(featuredSection).getByRole('button', { name: 'Call Lily' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('offers an upgrade instead of the creator to free users', () => {
    renderExperience({ customCharacters: [], isPaidUser: false });

    expect(
      screen.queryByRole('button', { name: /Create a character/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/dashboard/credits',
    );
  });
});

describe('CallExperience panel', () => {
  it('asks for a new voice when the saved voice was deleted', async () => {
    const user = userEvent.setup();
    renderExperience({
      customCharacters: [
        {
          ...own,
          sessionConfig: {
            ...defaultSessionConfig,
            audioReferenceId: '6f1d9c2a-0000-4000-8000-0000000000cc',
            model: ModelId.INWORLD_TTS,
            voice: 'Deleted voice',
          },
          voiceName: 'Deleted voice',
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Call Marco' }));
    const panel = await screen.findByTestId('call-panel');

    expect(within(panel).getByText('No voice')).toBeInTheDocument();
    expect(within(panel).queryByText('Deleted voice')).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: 'Start call' }),
    ).not.toBeInTheDocument();
    await user.click(
      within(panel).getByRole('button', { name: 'Choose a voice' }),
    );
    expect(await screen.findByTestId('character-creator')).toBeVisible();
    expect(connection.connect).not.toHaveBeenCalled();
  });

  it('opens the panel for a character and starts the call', async () => {
    const user = userEvent.setup();
    const { rerender } = renderExperience();

    await user.click(screen.getByRole('button', { name: 'Call Lily' }));
    const panel = await screen.findByTestId('call-panel');
    expect(within(panel).getByRole('heading', { name: 'Lily' })).toBeVisible();
    expect(within(panel).getByText(/Ara description/)).toBeInTheDocument();

    connection.connect.mockImplementation(async () => {
      connection.shouldConnect = true;
    });
    await user.click(within(panel).getByRole('button', { name: 'Start call' }));

    expect(microphone.request).toHaveBeenCalledOnce();
    expect(connection.connect).toHaveBeenCalledOnce();
    const tree = () => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlaygroundStateProvider
          defaultPresets={[featured]}
          initialCustomCharacters={[own]}
          initialState={{ selectedPresetId: featured.id }}
        >
          <CallExperience
            callVoices={callVoices}
            isPaidUser
            savedVoices={[savedVoice]}
          />
        </PlaygroundStateProvider>
      </NextIntlClientProvider>
    );
    rerender(tree());
    expect(await screen.findByTestId('in-call-view')).toHaveTextContent('Lily');
  });

  it('keeps the panel open without connecting when the microphone is blocked', async () => {
    const user = userEvent.setup();
    microphone.request.mockResolvedValue(false);
    renderExperience();

    await user.click(screen.getByRole('button', { name: 'Call Lily' }));
    const panel = await screen.findByTestId('call-panel');
    await user.click(within(panel).getByRole('button', { name: 'Start call' }));

    expect(connection.connect).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-panel')).toBeInTheDocument();
  });

  it('starts a remix of a featured character without its prompt', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(screen.getByRole('button', { name: 'Call Lily' }));
    await user.click(
      await screen.findByRole('button', { name: 'Make your own version' }),
    );

    const creator = await screen.findByTestId('character-creator');
    expect(within(creator).getByLabelText('Name')).toHaveValue('My Lily');
    expect(
      within(creator).getByRole('textbox', { name: 'Personality' }),
    ).toHaveValue('');
    expect(within(creator).getByRole('radio', { name: /Ara/ })).toBeChecked();
  });
});

describe('CallExperience creator', () => {
  it('shows what is missing, then saves a new character and opens it', async () => {
    const user = userEvent.setup();
    renderExperience({ customCharacters: [] });

    await user.click(
      screen.getByRole('button', { name: /Create a character/ }),
    );
    const creator = await screen.findByTestId('character-creator');
    await user.click(
      within(creator).getByRole('button', { name: 'Save character' }),
    );
    expect(
      within(creator).getByText('Give your character a name.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(within(creator).getByLabelText('Name'), 'Max');
    await user.click(
      within(creator).getByRole('button', { name: 'Interview coach' }),
    );
    expect(within(creator).getByLabelText('Short description')).toHaveValue(
      'Tough but fair interview coach',
    );
    await user.click(within(creator).getByRole('radio', { name: /My voice/ }));
    await user.click(
      within(creator).getByRole('button', { name: 'Save character' }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = lastPostBody();
    expect(body).not.toHaveProperty('id');
    expect(body).toMatchObject({
      localizedDescriptions: { en: 'Tough but fair interview coach' },
      name: 'Max',
      sessionConfig: {
        audioReferenceId: savedVoice.id,
        model: ModelId.MISTRAL_TTS,
        voice: 'My voice',
      },
      voiceName: 'My voice',
    });
    expect(body.prompt).toContain('job-interview coach');

    const panel = await screen.findByTestId('call-panel');
    expect(within(panel).getByRole('heading', { name: 'Max' })).toBeVisible();
    expect(toastMock.success).toHaveBeenCalledWith('Max saved');
  });

  it('updates an existing character from its menu', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(
      screen.getByRole('button', { name: 'More options for Marco' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const creator = await screen.findByTestId('character-creator');
    expect(
      within(creator).getByRole('heading', { name: 'Edit Marco' }),
    ).toBeInTheDocument();
    const personality = within(creator).getByRole('textbox', {
      name: 'Personality',
    });
    expect(personality).toHaveValue(own.instructions);

    await user.clear(personality);
    await user.type(personality, 'You are Marco, now stricter.');
    await user.click(
      within(creator).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(lastPostBody()).toMatchObject({
      id: own.id,
      localizedPrompts: { en: 'You are Marco, now stricter.' },
      prompt: 'You are Marco, now stricter.',
    });
    expect(toastMock.success).toHaveBeenCalledWith('Marco updated');
  });

  it('asks before discarding unsaved changes', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(
      screen.getByRole('button', { name: /Create a character/ }),
    );
    const creator = await screen.findByTestId('character-creator');
    await user.type(within(creator).getByLabelText('Name'), 'Draft');
    await user.click(within(creator).getByRole('button', { name: 'Cancel' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(screen.queryByTestId('character-creator')).not.toBeInTheDocument();
    expect(screen.getByTestId('character-picker')).toBeInTheDocument();
  });

  it('starts a character with the voice saved on the Clone page', async () => {
    // The real provider strips the query before LiveKitRoom mounts the
    // experience, so the page passes the clone return as a prop.
    window.history.replaceState({}, '', '/en/dashboard/call');
    renderExperience({ returnFromClone: { voiceId: savedVoice.id } });

    const creator = await screen.findByTestId('character-creator');
    expect(within(creator).getByLabelText('Name')).toHaveValue('');
    expect(
      within(creator).getByRole('radio', { name: /My voice/ }),
    ).toBeChecked();
  });

  it('starts an empty character when the saved voice is unknown', async () => {
    renderExperience({ returnFromClone: { voiceId: null } });

    const creator = await screen.findByTestId('character-creator');
    expect(
      within(creator).getByRole('radio', { name: /My voice/ }),
    ).not.toBeChecked();
  });

  it('clones a voice from an upload and selects it', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(
      screen.getByRole('button', { name: /Create a character/ }),
    );
    const creator = await screen.findByTestId('character-creator');
    await user.click(
      within(creator).getByRole('button', { name: /Clone a voice/ }),
    );
    const dialog = await screen.findByTestId('clone-voice-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(
      within(dialog).getByText('Record at least 10 seconds first.'),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Upload a file' }),
    );
    const sample = new File(['audio'], 'sample.wav', { type: 'audio/wav' });
    await user.upload(
      dialog.querySelector('input[type="file"]') as HTMLInputElement,
      sample,
    );
    expect(within(dialog).getByText('sample.wav')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));

    const name = within(dialog).getByLabelText('Name this voice');
    expect(name).toHaveValue('My voice 2');
    await user.clear(name);
    await user.type(name, 'Radio voice');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create voice' }),
    );
    expect(
      within(dialog).getByText(
        'Please confirm you have permission to clone this voice.',
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Create voice' }),
    );
    expect(
      await within(dialog).findByText('“Radio voice” is ready'),
    ).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/clone-voice');
    const form = init.body as FormData;
    expect(form.get('saveVoiceName')).toBe('Radio voice');
    expect(form.get('voiceConsent')).toBe('true');
    expect(form.get('locale')).toBe('en');
    expect(form.get('file')).toBe(sample);

    await user.click(
      within(dialog).getByRole('button', { name: 'Use this voice' }),
    );
    expect(screen.queryByTestId('clone-voice-dialog')).not.toBeInTheDocument();
    expect(
      within(creator).getByRole('radio', { name: /Radio voice/ }),
    ).toBeChecked();
    expect(within(creator).getByText('New')).toBeInTheDocument();
    await user.type(within(creator).getByLabelText('Name'), 'Radio host');
    await user.click(
      within(creator).getByRole('button', { name: 'Interview coach' }),
    );
    await user.click(
      within(creator).getByRole('button', { name: 'Save character' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('call-panel')).toBeInTheDocument(),
    );
    expect(lastPostBody()).toMatchObject({
      sessionConfig: {
        model: ModelId.INWORLD_TTS,
        audioReferenceId: clonedVoiceId,
        voice: 'Radio voice',
      },
    });
  });
});

describe('CallExperience clone without MediaRecorder', () => {
  it('offers only an upload', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    Reflect.deleteProperty(window, 'MediaRecorder');
    const user = userEvent.setup();
    renderExperience();

    await user.click(
      screen.getByRole('button', { name: /Create a character/ }),
    );
    await user.click(
      within(await screen.findByTestId('character-creator')).getByRole(
        'button',
        { name: /Clone a voice/ },
      ),
    );
    const dialog = await screen.findByTestId('clone-voice-dialog');
    expect(
      within(dialog).queryByRole('button', { name: 'Record now' }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Drop an audio file here/)).toBeVisible();
  });
});

describe('CallExperience delete', () => {
  const lastToastOptions = () =>
    toastMock.mock.calls.at(-1)?.[1] as {
      action: { onClick: () => void };
      onAutoClose: () => void;
    };

  it('removes a character at once and restores it on Undo without a request', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(
      screen.getByRole('button', { name: 'More options for Marco' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(
      screen.queryByRole('button', { name: 'Open Marco' }),
    ).not.toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith('Marco deleted', expect.anything());

    lastToastOptions().action.onClick();

    expect(
      await screen.findByRole('button', { name: 'Open Marco' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends pending deletes before the creator opens', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(
      screen.getByRole('button', { name: 'More options for Marco' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(
      screen.getByRole('button', { name: /Create a character/ }),
    );

    expect(toastMock.dismiss).toHaveBeenCalledWith('toast-id');
  });

  it('sends the delete when the Undo toast closes', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(
      screen.getByRole('button', { name: 'More options for Marco' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    lastToastOptions().onAutoClose();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/characters',
        expect.objectContaining({
          body: JSON.stringify({ id: own.id }),
          method: 'DELETE',
        }),
      ),
    );
  });
});
