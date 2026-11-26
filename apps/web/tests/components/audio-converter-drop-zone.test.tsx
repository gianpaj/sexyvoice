// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DropZone } from '@/app/[lang]/tools/audio-converter/components/drop-zone';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const messages = {
  audioConverter: {
    dropZone: { description: 'or click to browse', title: 'Drop here' },
    errors: { unsupportedFormat: 'Unsupported file format' },
  },
};

function renderDropZone(onFileSelect = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DropZone onFileSelect={onFileSelect} />
    </NextIntlClientProvider>,
  );
  return { onFileSelect, zone: screen.getByRole('button') };
}

function dragAndDrop(zone: HTMLElement, file: File) {
  const dataTransfer = { files: [file], items: [file] };
  fireEvent.dragEnter(zone, { dataTransfer });
  fireEvent.dragOver(zone, { dataTransfer });
  fireEvent.drop(zone, { dataTransfer });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('audio converter DropZone', () => {
  it('selects a dropped audio file and clears the drag highlight', () => {
    const { onFileSelect, zone } = renderDropZone();
    const file = new File(['x'], 'clip.mp3', { type: 'audio/mpeg' });

    dragAndDrop(zone, file);

    expect(onFileSelect).toHaveBeenCalledWith(file);
    expect(toast.error).not.toHaveBeenCalled();
    expect(zone).not.toHaveClass('border-primary');
  });

  it('rejects a dropped non-audio file with a toast and clears the drag highlight', () => {
    const { onFileSelect, zone } = renderDropZone();

    dragAndDrop(zone, new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Unsupported file format');
    expect(zone).not.toHaveClass('border-primary');
  });

  it.each([
    ['clip.mp4', 'video/mp4'],
    ['clip.flac', ''],
    ['CLIP.M4A', ''],
  ])('accepts advertised format %s with type "%s"', (name, type) => {
    const { onFileSelect, zone } = renderDropZone();
    const file = new File(['x'], name, { type });

    dragAndDrop(zone, file);

    expect(onFileSelect).toHaveBeenCalledWith(file);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('applies the same check to files chosen in the file picker', () => {
    const { onFileSelect, zone } = renderDropZone();
    const input = zone.querySelector('input[type="file"]') as HTMLInputElement;

    expect(input.accept.split(',')).toEqual(
      expect.arrayContaining([
        '.mp3',
        '.wav',
        '.aac',
        '.ogg',
        '.flac',
        '.m4a',
        '.mp4',
      ]),
    );
    expect(input.accept.split(',')).not.toContain('audio/*');

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Unsupported file format');
  });
});
