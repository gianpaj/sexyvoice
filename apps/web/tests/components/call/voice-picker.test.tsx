// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SavedCallVoices, VoicePicker } from '@/components/call/voice-picker';
import { defaultSessionConfig } from '@/data/default-config';
import type { DBVoice } from '@/data/voices';
import { SamplePlayerProvider } from '@/hooks/use-sample-player';
import type { SavedCallVoice } from '@/lib/call-voices';
import messages from '@/messages/en.json';

const builtIn = Array.from(
  { length: 9 },
  (_, i): DBVoice => ({
    description: null,
    feature: 'call',
    id: `built-in-${i + 1}`,
    language: 'en',
    model: 'grok',
    name: `Voice ${i + 1}`,
    sample_url: null,
    sort_order: i,
    type: null,
  }),
);

const saved = Array.from(
  { length: 5 },
  (_, i): SavedCallVoice => ({
    id: `saved-${i + 1}`,
    locale: 'en',
    name: `Clone ${i + 1}`,
    provider: 'inworld',
  }),
);

function renderPicker(voice = 'Voice 1', savedVoices: SavedCallVoice[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SamplePlayerProvider>
        <VoicePicker
          callVoices={builtIn}
          config={{ ...defaultSessionConfig, voice }}
          onChange={vi.fn()}
          onCloneVoice={vi.fn()}
          savedVoices={savedVoices}
        />
      </SamplePlayerProvider>
    </NextIntlClientProvider>,
  );
}

const radioNames = () =>
  screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'));

function setWide(wide: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        addEventListener: () => undefined,
        matches: wide,
        media: query,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VoicePicker', () => {
  it('shows four tiles per section on a phone', () => {
    renderPicker('Voice 1', saved);

    expect(radioNames()).toEqual([
      'saved-1',
      'saved-2',
      'saved-3',
      'built-in-1',
      'built-in-2',
      'built-in-3',
      'built-in-4',
    ]);
    expect(
      screen.getByRole('button', { name: /^Clone a voice/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show all (5)' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Show all (9)' })).toBeVisible();
  });

  it('keeps a later selected voice in the last slot', () => {
    renderPicker('Voice 8');

    expect(radioNames()).toEqual([
      'built-in-1',
      'built-in-2',
      'built-in-3',
      'built-in-8',
    ]);
    expect(screen.getByRole('radio', { name: /Voice 8/ })).toBeChecked();
  });

  it('expands in place, focuses the first new tile and collapses', async () => {
    const user = userEvent.setup();
    renderPicker('Voice 8');

    await user.click(screen.getByRole('button', { name: 'Show all (9)' }));

    expect(radioNames()).toEqual(builtIn.map((voice) => voice.id));
    expect(screen.getByRole('radio', { name: /Voice 4/ })).toHaveFocus();
    const toggle = screen.getByRole('button', { name: 'Show fewer' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);

    expect(radioNames()).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Show all (9)' })).toHaveFocus();
  });

  it('shows six tiles per section on wider screens', () => {
    setWide(true);
    renderPicker('Voice 1', saved);

    expect(radioNames()).toHaveLength(5 + 6);
    expect(
      screen.queryByRole('button', { name: 'Show all (5)' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all (9)' })).toBeVisible();
  });

  it('disables Clone a voice at 10 saved voices', () => {
    const tenVoices = Array.from({ length: 10 }, (_, i) => ({
      ...saved[0],
      id: `saved-limit-${i}`,
    }));
    renderPicker('Voice 1', tenVoices);

    const cloneTile = screen.getByRole('button', { name: /^Clone a voice/ });
    expect(cloneTile).toBeDisabled();
    expect(cloneTile).toHaveTextContent(
      messages.call.voices.cloneLimit.replace('{max}', '10'),
    );
  });

  it('has no toggle when every voice fits', () => {
    renderPicker('Voice 1', saved.slice(0, 3));

    expect(radioNames().slice(0, 3)).toEqual(['saved-1', 'saved-2', 'saved-3']);
    expect(
      screen.queryByRole('button', { name: 'Show all (3)' }),
    ).not.toBeInTheDocument();
  });
});

describe('SavedCallVoices', () => {
  it('collapses, selects and deletes saved voices on the Clone page', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SamplePlayerProvider>
          <SavedCallVoices
            onDelete={onDelete}
            onSelect={onSelect}
            selectedId={null}
            voices={saved}
          />
        </SamplePlayerProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole('radio', { name: /Clone 5/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show all (5)' }));
    await user.click(screen.getByRole('radio', { name: /Clone 5/ }));
    await user.click(
      screen.getByRole('button', { name: 'More options for Clone 2' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(onSelect).toHaveBeenCalledWith(saved[4]);
    expect(onDelete).toHaveBeenCalledWith(saved[1]);
  });
});
