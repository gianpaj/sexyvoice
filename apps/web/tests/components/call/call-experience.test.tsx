// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CallExperience } from '@/components/call/call-experience';
import {
  CallSessionProvider,
  useCallSession,
} from '@/components/call/call-session';
import { CallSetupProvider } from '@/components/call/call-setup';
import type { Character } from '@/lib/calls/characters';
import { DEFAULT_SESSION_CONFIG } from '@/lib/calls/characters';
import type { CallVoice, SavedCallVoice } from '@/lib/calls/voices';
import messages from '@/messages/en.json';
import { makeCharacter } from '../../utils/call-test-utils';

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

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock('@/lib/supabase/client', () => ({
  default: () => ({ auth: { getClaims: vi.fn(async () => null) } }),
}));
vi.mock('@/components/call/use-microphone-permission', () => ({
  useMicrophonePermission: () => microphone,
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('next/dynamic', () => ({
  default: () =>
    function InCallView({ character }: { character: Character }) {
      return <div data-testid="in-call-view">{character.name}</div>;
    },
}));
vi.mock('next/image', () => ({
  default: ({ src }: { src: string }) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt="" height={56} src={src} width={56} />
  ),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/use-ffmpeg', () => ({
  useFFmpeg: () => ({ convert: vi.fn(), ensureLoaded: vi.fn() }),
}));
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: routerPush }),
}));

const featured = makeCharacter({
  id: '6f1d9c2a-0000-4000-8000-000000000001',
  image: 'lily.webp',
  isPublic: true,
  localizedDescriptions: { en: 'Shy, warm, and playful.' },
  name: 'Lily',
  sessionConfig: { ...DEFAULT_SESSION_CONFIG, voice: 'Ara' },
  voiceSampleUrl: 'https://cdn.example.com/ara.mp3',
});

const own = makeCharacter({
  id: '6f1d9c2a-0000-4000-8000-000000000002',
  localizedDescriptions: { en: 'Patient Italian tutor' },
  localizedPrompts: { en: 'You are Marco, a patient Italian tutor.' },
  name: 'Marco',
  prompt: 'You are Marco, a patient Italian tutor.',
  sessionConfig: { ...DEFAULT_SESSION_CONFIG, voice: 'Rex' },
});

const callVoices = ['Ara', 'Rex'].map(
  (name): CallVoice => ({
    description: `${name} description`,
    id: `voice-${name}`,
    name,
    sample_url: `https://cdn.example.com/${name}.mp3`,
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
  customCharacters?: Character[];
  isPaidUser?: boolean;
  returnFromClone?: { voiceId: string | null } | null;
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallSetupProvider
        customCharacters={customCharacters}
        language="en"
        predefinedCharacters={[featured]}
      >
        <CallSessionProvider>
          <SessionProbe />
          <CallExperience
            callVoices={callVoices}
            isPaidUser={isPaidUser}
            returnFromClone={returnFromClone}
            savedVoices={[savedVoice]}
          >
            <p>Footer</p>
          </CallExperience>
        </CallSessionProvider>
      </CallSetupProvider>
    </NextIntlClientProvider>,
  );
}

let callSession: ReturnType<typeof useCallSession>;
// Stands in for the LiveKit room, which reports to the session.
function SessionProbe() {
  callSession = useCallSession();
  return null;
}

const savedResponse = (body: Record<string, unknown>, id: string) => ({
  id,
  image: null,
  is_public: false,
  localized_descriptions: body.localizedDescriptions,
  localized_sample_urls: null,
  name: body.name,
  prompts: { localized_prompts: body.localizedPrompts, prompt: body.prompt },
  session_config: body.sessionConfig,
  voices: null,
});

beforeEach(() => {
  window.history.replaceState({}, '', '/en/dashboard/call');
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
      const form = init.body as FormData;
      return Response.json({
        voice: {
          id: clonedVoiceId,
          locale: form.get('locale'),
          name: form.get('saveVoiceName'),
          provider: 'inworld',
        },
      });
    }
    if (url === '/api/call-token') {
      return Response.json({
        accessToken: 'call-token',
        url: 'wss://test.livekit.cloud',
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

const callTokenRequests = () =>
  fetchMock.mock.calls
    .filter(([url]) => url === '/api/call-token')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

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
    const upgrade = screen.getByRole('link', { name: /Create a character/ });
    expect(upgrade).toHaveAttribute('href', '/dashboard/credits');
    expect(upgrade).toHaveTextContent(
      messages.call.picker.createUpgradePersonality,
    );
    expect(upgrade).toHaveTextContent(messages.call.picker.createUpgradeVoice);
  });

  it('shows free users that Make your own version needs a plan', async () => {
    const user = userEvent.setup();
    renderExperience({ customCharacters: [], isPaidUser: false });

    await user.click(screen.getByRole('button', { name: 'Open Lily' }));
    const panel = await screen.findByTestId('call-panel');

    expect(
      within(panel).getByRole('button', {
        name: messages.call.panel.makeYourOwn,
      }),
    ).toBeDisabled();
    expect(
      within(panel).getByRole('link', {
        name: messages.call.panel.makeYourOwnUpgrade,
      }),
    ).toHaveAttribute('href', '/dashboard/credits');
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
            ...DEFAULT_SESSION_CONFIG,
            audioReferenceId: '6f1d9c2a-0000-4000-8000-0000000000cc',
            model: 'inworld-tts',
            voice: 'Deleted voice',
          },
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Open Marco' }));
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
    expect(callTokenRequests()).toEqual([]);
  });

  it('opens the panel from a card and starts the call', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(screen.getByRole('button', { name: 'Open Lily' }));
    const panel = await screen.findByTestId('call-panel');
    expect(within(panel).getByRole('heading', { name: 'Lily' })).toBeVisible();
    expect(within(panel).getByText(/Ara description/)).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Start call' }));

    expect(microphone.request).toHaveBeenCalledOnce();
    expect(callTokenRequests()).toEqual([
      {
        characterId: featured.id,
        language: 'en',
        sceneId: null,
        sceneText: null,
      },
    ]);
    expect(await screen.findByTestId('in-call-view')).toHaveTextContent('Lily');
    expect(screen.queryByTestId('call-panel')).not.toBeInTheDocument();
  });

  it("starts a call from a card's Call without opening the panel", async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(screen.getByRole('button', { name: 'Call Lily' }));

    expect(await screen.findByTestId('in-call-view')).toHaveTextContent('Lily');
    expect(callTokenRequests()).toMatchObject([{ characterId: featured.id }]);
    expect(microphone.request).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('call-panel')).not.toBeInTheDocument();
  });

  it('shows how long a call lasted and calls again', async () => {
    const user = userEvent.setup();
    renderExperience();
    await user.click(screen.getByRole('button', { name: 'Call Lily' }));
    await screen.findByTestId('in-call-view');

    act(() => callSession.roomConnected());
    act(() => callSession.agentChanged(true, 'listening'));
    act(() => callSession.disconnect());

    const ended = await screen.findByTestId('call-ended-view');
    expect(ended).toHaveTextContent('Lily');
    expect(ended).toHaveTextContent('00:00');

    await user.click(within(ended).getByRole('button', { name: 'Call again' }));
    expect(await screen.findByTestId('in-call-view')).toHaveTextContent('Lily');
    expect(callTokenRequests()).toHaveLength(2);
  });

  it('returns to the picker from an ended call', async () => {
    const user = userEvent.setup();
    renderExperience();
    await user.click(screen.getByRole('button', { name: 'Call Lily' }));
    await screen.findByTestId('in-call-view');
    act(() => callSession.roomConnected());
    act(() => callSession.disconnect());

    const ended = await screen.findByTestId('call-ended-view');
    await user.click(
      within(ended).getByRole('button', { name: messages.call.ended.back }),
    );

    expect(await screen.findByTestId('character-picker')).toBeVisible();
    expect(screen.queryByTestId('call-ended-view')).not.toBeInTheDocument();
  });

  it('opens the panel instead when the character has lost its voice', async () => {
    const user = userEvent.setup();
    renderExperience({
      customCharacters: [
        {
          ...own,
          sessionConfig: {
            ...DEFAULT_SESSION_CONFIG,
            audioReferenceId: '6f1d9c2a-0000-4000-8000-0000000000cc',
            model: 'inworld-tts',
            voice: 'Deleted voice',
          },
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Call Marco' }));

    const panel = await screen.findByTestId('call-panel');
    expect(
      within(panel).getByRole('button', { name: 'Choose a voice' }),
    ).toBeInTheDocument();
    expect(callTokenRequests()).toEqual([]);
  });

  it('opens the panel when a Call finds the microphone blocked', async () => {
    const user = userEvent.setup();
    microphone.request.mockResolvedValue(false);
    renderExperience();

    await user.click(screen.getByRole('button', { name: 'Call Lily' }));

    expect(await screen.findByTestId('call-panel')).toBeInTheDocument();
    expect(callTokenRequests()).toEqual([]);
  });

  it('keeps the panel open without connecting when the microphone is blocked', async () => {
    const user = userEvent.setup();
    microphone.request.mockResolvedValue(false);
    renderExperience();

    await user.click(screen.getByRole('button', { name: 'Open Lily' }));
    const panel = await screen.findByTestId('call-panel');
    await user.click(within(panel).getByRole('button', { name: 'Start call' }));

    expect(callTokenRequests()).toEqual([]);
    expect(screen.getByTestId('call-panel')).toBeInTheDocument();
  });

  it('starts a remix of a featured character without its prompt', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(screen.getByRole('button', { name: 'Open Lily' }));
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
        model: 'mistral-tts',
        voice: 'My voice',
      },
    });
    expect(body.prompt).toContain('job-interview coach');

    const panel = await screen.findByTestId('call-panel');
    expect(within(panel).getByRole('heading', { name: 'Max' })).toBeVisible();
    expect(toastMock.success).toHaveBeenCalledWith('Max saved');
  });

  it('calls an unchanged character from the editor preview', async () => {
    const user = userEvent.setup();
    renderExperience();
    await user.click(
      screen.getByRole('button', { name: 'More options for Marco' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const creator = await screen.findByTestId('character-creator');
    const call = within(creator).getByRole('button', { name: 'Call' });
    expect(call).toBeEnabled();

    await user.type(within(creator).getByLabelText('Name'), 'x');
    expect(call).toBeDisabled();
    await user.clear(within(creator).getByLabelText('Name'));
    await user.type(within(creator).getByLabelText('Name'), 'Marco');
    // Any edit needs saving first, even one typed back.
    expect(call).toBeDisabled();
  });

  it('starts a call from the editor preview', async () => {
    const user = userEvent.setup();
    renderExperience();
    await user.click(
      screen.getByRole('button', { name: 'More options for Marco' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const creator = await screen.findByTestId('character-creator');

    await user.click(within(creator).getByRole('button', { name: 'Call' }));

    await waitFor(() =>
      expect(callTokenRequests()).toMatchObject([{ characterId: own.id }]),
    );
    expect(screen.queryByTestId('character-creator')).not.toBeInTheDocument();
  });

  it('cannot call a new character before it is saved', async () => {
    const user = userEvent.setup();
    renderExperience();
    await user.click(
      screen.getByRole('button', { name: /Create a character/ }),
    );
    const creator = await screen.findByTestId('character-creator');
    expect(
      within(creator).getByRole('button', { name: 'Call' }),
    ).toBeDisabled();
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
    expect(personality).toHaveValue(own.prompt);

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
        model: 'inworld-tts',
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
