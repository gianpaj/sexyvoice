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
});
