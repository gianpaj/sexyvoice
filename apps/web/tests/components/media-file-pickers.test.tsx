// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';

import { DropZone } from '@/app/[lang]/tools/audio-joiner/components/drop-zone';
import { AudioInput } from '@/app/[lang]/tools/transcribe/components/audio-input';
import messages from '@/messages/en.json';

afterEach(cleanup);

it('lets Audio Joiner select multiple audio files by extension', async () => {
  const onFilesSelected = vi.fn();
  const { container } = render(
    <DropZone
      addFilesLabel="Add files"
      onFilesSelected={onFilesSelected}
      subtitle="Select audio files"
      title="Add audio files"
    />,
  );
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Audio Joiner file input is missing');

  expect(input.accept.split(',')).not.toContain('audio/*');
  const files = [
    new File(['first'], 'first.mp3', { type: 'audio/mpeg' }),
    new File(['second'], 'second.M4A'),
  ];
  await userEvent.upload(input, files);
  expect(onFilesSelected).toHaveBeenCalledExactlyOnceWith(files);
});

it('offers explicit audio formats and videos for transcription', () => {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AudioInput onAudioReady={vi.fn()} />
    </NextIntlClientProvider>,
  );
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Transcription file input is missing');

  const formats = input.accept.split(',');
  expect(formats).toEqual(
    expect.arrayContaining(['.mp3', '.wav', '.m4a', '.webm', 'video/*']),
  );
  expect(formats).not.toContain('audio/*');
});
