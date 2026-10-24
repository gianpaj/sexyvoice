// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigurationForm } from '@/components/call/configuration-form';
import { ConnectButton } from '@/components/call/connect-button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { defaultSessionConfig } from '@/data/default-config';
import type { DBVoice } from '@/data/voices';
import {
  PlaygroundStateProvider,
  usePlaygroundState,
} from '@/hooks/use-playground-state';
import { callDraftStorageKey } from '@/lib/call-draft';
import en from '@/messages/en.json';

vi.mock('@livekit/components-react', () => ({
  useConnectionState: () => 'disconnected',
  useLocalParticipant: () => ({ localParticipant: { attributes: {} } }),
  useVoiceAssistant: () => ({ agent: undefined }),
}));
vi.mock('@/hooks/use-connection', () => ({
  useConnection: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    shouldConnect: false,
  }),
}));
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/call/preset-selector', () => ({
  PresetSelector: () => {
    const { pgState, helpers, selectPreset } = usePlaygroundState();
    return (
      <div>
        {helpers.getAllPresets(pgState).map((p) => (
          <button key={p.id} onClick={() => selectPreset(p.id)} type="button">
            {p.name}
          </button>
        ))}
      </div>
    );
  },
}));

const reference = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'My saved voice',
  locale: 'en',
};
const voices = [
  { id: 'ara', name: 'Ara', description: 'Warm voice', sample_url: null },
  { id: 'rex', name: 'Rex', description: 'Deep voice', sample_url: null },
] as DBVoice[];
const preset = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Lily',
  instructions: '',
  isPublic: true,
  sessionConfig: defaultSessionConfig,
};
function Payload() {
  const { pgState, helpers } = usePlaygroundState();
  return (
    <output data-testid="payload">
      {JSON.stringify(helpers.getStateWithFullInstructions(pgState))}
    </output>
  );
}
function setup(paid = true) {
  return render(
    <StrictMode>
      <NextIntlClientProvider locale="en" messages={en}>
        <PlaygroundStateProvider
          defaultPresets={[preset]}
          initialState={{ selectedPresetId: preset.id }}
        >
          <TooltipProvider>
            <ConfigurationForm
              callVoices={voices}
              isPaidUser={paid}
              lang="en"
              savedVoices={[reference]}
              userId="owner"
            />
            <ConnectButton />
            <Payload />
          </TooltipProvider>
        </PlaygroundStateProvider>
      </NextIntlClientProvider>
    </StrictMode>,
  );
}
const payload = () => JSON.parse(screen.getByTestId('payload').textContent!);

beforeEach(() => {
  window.history.replaceState({}, '', '/en/dashboard/call');
  sessionStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe('Custom call setup', () => {
  it('saves the chosen cloned voice and prompt as a reusable character', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            id,
            name: body.name,
            is_public: false,
            session_config: body.sessionConfig,
            prompts: {
              prompt: body.prompt,
              localized_prompts: body.localizedPrompts,
            },
          }),
          { status: 201 },
        );
      });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('tab', { name: 'Custom' }));
    await user.click(screen.getByRole('tab', { name: 'My voices' }));
    await user.click(screen.getByRole('button', { name: reference.name }));
    await user.click(screen.getByRole('button', { name: /Add a personality/ }));
    await user.type(screen.getByLabelText(/Name/), 'Storyteller');
    await user.type(
      screen.getByLabelText('Personality prompt'),
      'Tell stories',
    );
    await user.click(screen.getByRole('button', { name: 'Save character' }));
    await waitFor(() => expect(payload().selectedPresetId).toBe(id));
    expect(screen.getByRole('tab', { name: 'Characters' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      name: 'Storyteller',
      prompt: 'Tell stories',
      sessionConfig: {
        model: 'mistral-tts',
        audioReferenceId: reference.id,
        voice: reference.name,
      },
    });
    expect(body).not.toHaveProperty('id');
    expect(payload().sessionConfig.audioReferenceId).toBe(reference.id);
  });
  it('starts closed, requires a prompt, and preserves the draft across mode switches', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('tab', { name: 'Custom' }));
    const accordion = screen.getByRole('button', { name: /Add a personality/ });
    expect(accordion).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Start call' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Clone a voice' })).toBeVisible();
    await user.click(accordion);
    await user.type(
      screen.getByLabelText('Personality prompt'),
      'Speak warmly and tell short stories.',
    );
    expect(screen.getByRole('button', { name: 'Start call' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Save character' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: 'My voices' }));
    await user.click(screen.getByRole('button', { name: 'My saved voice' }));
    expect(payload().sessionConfig).toMatchObject({
      model: 'mistral-tts',
      audioReferenceId: reference.id,
    });
    await user.click(screen.getByRole('tab', { name: 'Characters' }));
    expect(payload().selectedPresetId).toBe(preset.id);
    await user.click(screen.getByRole('tab', { name: 'Custom' }));
    expect(payload()).toMatchObject({
      selectedPresetId: null,
      instructions: 'Speak warmly and tell short stories.',
    });
    expect(payload().sessionConfig.audioReferenceId).toBe(reference.id);
    await user.click(screen.getByRole('tab', { name: 'Built-in voices' }));
    await user.click(screen.getByRole('button', { name: 'Rex' }));
    expect(payload().sessionConfig).toMatchObject({
      model: defaultSessionConfig.model,
      voice: 'Rex',
    });
    expect(payload().sessionConfig.audioReferenceId).toBeUndefined();
  });

  it('restores the owner draft on return from Clone and selects the saved profile', async () => {
    sessionStorage.setItem(
      callDraftStorageKey('owner'),
      JSON.stringify({
        name: 'Storyteller',
        description: 'Warm',
        instructions: 'Tell stories',
        sessionConfig: defaultSessionConfig,
      }),
    );
    window.history.replaceState(
      {},
      '',
      `/en/dashboard/call?custom=1&voice=${reference.id}`,
    );
    setup();
    await waitFor(() =>
      expect(payload().sessionConfig.audioReferenceId).toBe(reference.id),
    );
    expect(payload().instructions).toBe('Tell stories');
    expect(screen.getByRole('tab', { name: 'Custom' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('button', { name: /Add a personality/ }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps Custom discoverable for free users with disabled paid controls', async () => {
    const user = userEvent.setup();
    setup(false);
    await user.click(screen.getByRole('tab', { name: 'Custom' }));
    expect(
      screen.getByText('Custom calls require a paid account.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start call' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rex' })).toBeDisabled();
  });
});
