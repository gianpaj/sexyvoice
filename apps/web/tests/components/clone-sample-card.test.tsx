// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CloneSampleCard from '@/app/[lang]/(dashboard)/dashboard/clone/clone-sample-card';
import messages from '@/messages/en.json';

vi.mock('@wavesurfer/react', () => ({ default: () => null }));
vi.mock('@/lib/i18n/navigation', () => ({ Link: () => null }));
const fetchMock = vi.fn();
const props = {
  addFiles: vi.fn(),
  onSelectSample: vi.fn(),
  setErrorMessage: vi.fn(),
  setStatus: vi.fn(),
};
const renderSample = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CloneSampleCard {...props} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('dashboard demo selection', () => {
  it('loads the matching German reference, language, and tagged text', async () => {
    fetchMock.mockResolvedValue(
      new Response('sample', { headers: { 'content-type': 'audio/mpeg' } }),
    );
    renderSample();
    fireEvent.click(screen.getByTestId('demo-clone-speaker-heike'));
    fireEvent.click(screen.getByText('Calm & slow', { exact: true }));
    fireEvent.click(screen.getByTestId('demo-clone-try'));
    expect(screen.getByTestId('demo-clone-try')).toBeDisabled();
    await waitFor(() => expect(props.addFiles).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/demo-clones/voxtral-3/heike-reference.mp3',
    );
    expect(props.onSelectSample).toHaveBeenCalledWith({
      locale: 'de',
      prompt:
        '[emotion=calm][pace=slow] Ach, da bist du ja genau im richtigen Moment.',
    });
    const [file] = props.addFiles.mock.calls[0][0] as File[];
    expect(file.name).toBe('heike-reference.mp3');
    expect(file.type).toBe('audio/mpeg');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('allows retry after a download failure', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    renderSample();
    fireEvent.click(screen.getByTestId('demo-clone-try'));
    await waitFor(() => expect(props.setStatus).toHaveBeenCalledWith('error'));
    expect(props.setErrorMessage).toHaveBeenCalledWith(
      messages.landing.demoClone.audioError,
    );
    expect(props.addFiles).not.toHaveBeenCalled();
    expect(screen.getByTestId('demo-clone-try')).toBeEnabled();
  });

  it('cancels a pending selection when a user upload removes the demo', async () => {
    let complete: (response: Response) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { unmount } = renderSample();
    fireEvent.click(screen.getByTestId('demo-clone-try'));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => complete(new Response('sample')));
    expect(props.addFiles).not.toHaveBeenCalled();
    expect(props.onSelectSample).not.toHaveBeenCalled();
    expect(props.setStatus).not.toHaveBeenCalled();
  });
});
