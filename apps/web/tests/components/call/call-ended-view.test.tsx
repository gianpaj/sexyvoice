// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { CallEndedView } from '@/components/call/call-ended-view';
import { defaultSessionConfig } from '@/data/default-config';
import type { Preset } from '@/data/presets';
import type { CallRecordingFiles } from '@/hooks/use-call-recording';
import messages from '@/messages/en.json';

const preset: Preset = {
  id: '6f1d9c2a-0000-4000-8000-000000000001',
  instructions: '',
  isPublic: true,
  localizedDescriptions: { en: 'Shy, warm, and playful.' },
  name: 'Lily',
  sessionConfig: { ...defaultSessionConfig, voice: 'Ara' },
  voiceName: 'Ara',
  voiceSampleUrl: 'https://cdn.example.com/ara.mp3',
};

function renderView(recording?: CallRecordingFiles) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallEndedView
        connecting={false}
        duration="01:42"
        onBack={vi.fn()}
        onCallAgain={vi.fn()}
        onEdit={vi.fn()}
        preset={preset}
        recording={recording}
      />
    </NextIntlClientProvider>,
  );
}

describe('CallEndedView recording downloads', () => {
  it('links each recorded file for download', () => {
    renderView({
      audio: { filename: 'Lily - SexyVoice.m4a', url: 'blob:audio' },
      video: { filename: 'Lily - SexyVoice.mp4', url: 'blob:video' },
    });

    const audio = screen.getByRole('link', { name: 'Download audio' });
    expect(audio).toHaveAttribute('href', 'blob:audio');
    expect(audio).toHaveAttribute('download', 'Lily - SexyVoice.m4a');
    const video = screen.getByRole('link', { name: 'Download video' });
    expect(video).toHaveAttribute('href', 'blob:video');
    expect(video).toHaveAttribute('download', 'Lily - SexyVoice.mp4');
  });

  it('shows no downloads before a recording is ready', () => {
    renderView();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
