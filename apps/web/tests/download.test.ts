// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { downloadUrl } from '@/lib/download';

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
