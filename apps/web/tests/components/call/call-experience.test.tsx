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
import { callDraftStorageKey } from '@/lib/call-draft';
import type { SavedCallVoice } from '@/lib/call-voices';
import messages from '@/messages/en.json';

const connection = vi.hoisted(() => ({
  connect: vi.fn(),
  shouldConnect: false,
  state: 'disconnected',
}));
const microphone = vi.hoisted(() => ({
  request: vi.fn(),
  status: 'unknown',
}));
const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
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
    disconnect: vi.fn(),
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
};

const userId = 'user-1';
let fetchMock: ReturnType<typeof vi.fn>;

function renderExperience({
  customCharacters = [own],
  isPaidUser = true,
}: {
  customCharacters?: Preset[];
  isPaidUser?: boolean;
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
          savedVoices={[savedVoice]}
          userId={userId}
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
  sessionStorage.clear();
  connection.connect.mockReset().mockResolvedValue(undefined);
  connection.shouldConnect = false;
  connection.state = 'disconnected';
  microphone.request.mockReset().mockResolvedValue(true);
  microphone.status = 'unknown';
  toastMock.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  routerPush.mockClear();
  window.scrollTo = vi.fn();
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (init.method === 'DELETE') return new Response(null, { status: 200 });
    return Response.json(savedResponse(body, body.id ?? 'new-character-id'), {
      status: body.id ? 200 : 201,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
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
    rerender(
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
            userId={userId}
          />
        </PlaygroundStateProvider>
      </NextIntlClientProvider>,
    );
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

  it('reopens the draft with the cloned voice on return from Clone', async () => {
    sessionStorage.setItem(
      callDraftStorageKey(userId),
      JSON.stringify({
        description: 'Kept description',
        instructions: 'Kept personality',
        name: 'Kept name',
        sessionConfig: { ...defaultSessionConfig },
      }),
    );
    window.history.replaceState(
      {},
      '',
      `/en/dashboard/call?custom=1&voice=${savedVoice.id}`,
    );
    renderExperience();

    const creator = await screen.findByTestId('character-creator');
    expect(within(creator).getByLabelText('Name')).toHaveValue('Kept name');
    expect(
      within(creator).getByRole('textbox', { name: 'Personality' }),
    ).toHaveValue('Kept personality');
    expect(
      within(creator).getByRole('radio', { name: /My voice/ }),
    ).toBeChecked();
    expect(sessionStorage.getItem(callDraftStorageKey(userId))).toBeNull();
    expect(window.location.search).toBe('');
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
