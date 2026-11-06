// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { GenerationSettingsPanel } from '@/components/generation-settings-panel';
import type { GenerationSettings } from '@/hooks/use-generation-settings';
import messages from '@/messages/en.json';

const ORPHEUS_MODEL =
  'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f';
const t = messages.generate.advancedSettings;
const UNSET: GenerationSettings = {
  seed: null,
  speed: null,
  temperature: null,
};

function renderPanel({
  isPaidUser = true,
  model,
  settings = UNSET,
}: {
  isPaidUser?: boolean;
  model: string;
  settings?: GenerationSettings;
}) {
  const updateSettings = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GenerationSettingsPanel
        isPaidUser={isPaidUser}
        resetSettings={vi.fn()}
        selectedVoice={{ id: 'voice-id', model } as Tables<'voices'>}
        settings={settings}
        updateSettings={updateSettings}
      />
    </NextIntlClientProvider>,
  );
  return { updateSettings };
}

async function openPanel() {
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: /Advanced/ }));
  return screen.getByRole('dialog');
}

describe('GenerationSettingsPanel', () => {
  it('offers seed and temperature for Gemini voices', async () => {
    renderPanel({ model: 'gpro38' });
    const panel = await openPanel();

    expect(within(panel).getByText(t.seed.label)).toBeInTheDocument();
    expect(within(panel).getByText(t.temperature.label)).toBeInTheDocument();
    expect(within(panel).queryByText(t.speed.label)).not.toBeInTheDocument();
    const slider = within(panel).getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '2');
  });

  it('offers speed for Grok voices', async () => {
    renderPanel({ model: 'xai' });
    const panel = await openPanel();

    expect(within(panel).getByText(t.speed.label)).toBeInTheDocument();
    expect(within(panel).queryByText(t.seed.label)).not.toBeInTheDocument();
    const slider = within(panel).getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '0.7');
    expect(slider).toHaveAttribute('aria-valuemax', '1.5');
  });

  it('has no settings for Orpheus voices', async () => {
    renderPanel({ model: ORPHEUS_MODEL });
    const panel = await openPanel();

    expect(within(panel).getByText(t.noSettings)).toBeInTheDocument();
    expect(within(panel).queryByRole('slider')).not.toBeInTheDocument();
  });

  it.each([
    { count: 2, model: 'gpro38' },
    { count: 1, model: 'xai' },
    { count: 0, model: ORPHEUS_MODEL },
  ])('counts the $count settings a $model voice uses', ({ count, model }) => {
    renderPanel({ model, settings: { seed: 1, speed: 1.2, temperature: 1 } });

    const trigger = screen.getByRole('button', { name: /Advanced/ });
    if (count === 0) {
      expect(trigger).toHaveAccessibleName('Advanced');
    } else {
      expect(trigger).toHaveTextContent(`Advanced${count}`);
    }
  });

  it('keeps seeds whole and non-negative', async () => {
    const { updateSettings } = renderPanel({
      model: 'gpro38',
      settings: { ...UNSET, seed: 5 },
    });
    const panel = await openPanel();
    const seed = within(panel).getByPlaceholderText(t.seed.placeholder);

    fireEvent.change(seed, { target: { value: '-5' } });
    expect(updateSettings).toHaveBeenLastCalledWith({ seed: 0 });
    fireEvent.change(seed, { target: { value: '12.7' } });
    expect(updateSettings).toHaveBeenLastCalledWith({ seed: 12 });
    fireEvent.change(seed, { target: { value: '' } });
    expect(updateSettings).toHaveBeenLastCalledWith({ seed: null });

    await userEvent
      .setup()
      .click(within(panel).getByRole('button', { name: t.seed.randomize }));
    const { seed: randomSeed } = updateSettings.mock.lastCall?.[0] ?? {};
    expect(Number.isInteger(randomSeed)).toBe(true);
    expect(randomSeed).toBeGreaterThanOrEqual(1_000_000);
    expect(randomSeed).toBeLessThan(10_000_000);
  });

  it('dims the paid Gemini settings for free users', async () => {
    renderPanel({ isPaidUser: false, model: 'gpro38' });
    const panel = await openPanel();

    expect(
      within(panel)
        .getByPlaceholderText(t.seed.placeholder)
        .closest('.pointer-events-none'),
    ).not.toBeNull();
    expect(
      within(panel).getByRole('slider').closest('.pointer-events-none'),
    ).not.toBeNull();
  });

  it('leaves Grok speed open to free users', async () => {
    renderPanel({ isPaidUser: false, model: 'xai' });
    const panel = await openPanel();

    expect(
      within(panel).getByRole('slider').closest('.pointer-events-none'),
    ).toBeNull();
  });
});
