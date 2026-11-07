// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob, downloadUrl } from '@/lib/download';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('downloadUrl', () => {
  it('clicks a direct download link for R2 audio without fetching the file', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const anchor = document.createElement('a');
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
    const url = 'https://files.sexyvoice.ai/cloned-audio/example.wav';

    await downloadUrl(url, anchor);

    expect(anchor.href).toBe(url);
    expect(anchor.download).toBe('example.wav');
    expect(anchor.rel).toBe('noopener');
    expect(click).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(anchor.isConnected).toBe(false);
  });

  it('uses non-R2 URLs directly', async () => {
    const anchor = document.createElement('a');
    vi.spyOn(anchor, 'click').mockImplementation(() => undefined);

    await downloadUrl('https://example.com/audio.mp3', anchor);

    expect(anchor.href).toBe('https://example.com/audio.mp3');
    expect(anchor.download).toBe('audio.mp3');
  });

  it('rejects an empty URL', async () => {
    await expect(downloadUrl('', document.createElement('a'))).rejects.toThrow(
      'URL is required',
    );
  });
});

describe('downloadBlob', () => {
  it('downloads the blob under the given name and frees its URL later', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:joined');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });

    downloadBlob(new Blob(['audio']), 'generated-audio.wav');

    expect(clicked).toEqual([
      { download: 'generated-audio.wav', href: 'blob:joined' },
    ]);
    expect(document.querySelector('a')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:joined');
  });
});
