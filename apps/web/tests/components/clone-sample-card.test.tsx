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
import { getDemoCloneLanguages } from '@/data/demo-clone';
import type { Locale } from '@/lib/i18n/i18n-config';
import messages from '@/messages/en.json';
import italianMessages from '@/messages/it.json';

vi.mock('@/components/native-audio-waveform', () => ({
  NativeAudioWaveform: () => null,
}));
vi.mock('@/lib/i18n/navigation', () => ({ Link: () => null }));
const fetchMock = vi.fn();
const props = {
  addFiles: vi.fn(),
  onSelectSample: vi.fn(),
  setErrorMessage: vi.fn(),
  setStatus: vi.fn(),
};
const renderSample = (locale: Locale = 'en', translatedMessages = messages) =>
  render(
    <NextIntlClientProvider locale={locale} messages={translatedMessages}>
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
  it('defaults the dashboard chooser to its route locale without fetching pending audio', async () => {
    fetchMock.mockResolvedValue(
      new Response('sample', { headers: { 'content-type': 'audio/mpeg' } }),
    );
    renderSample('it', italianMessages);
    const select = screen.getByTestId('demo-clone-language');
    expect(select).toHaveValue('it');
    expect(screen.getAllByRole('option')).toHaveLength(9);
    expect(screen.getAllByRole('option')[0]).toHaveValue('it');
    expect(screen.getByRole('status')).toHaveTextContent(
      italianMessages.landing.demoClone.samplePending,
    );
    expect(screen.getByTestId('demo-clone-prompt-text').textContent).toBe(
      getDemoCloneLanguages('it')[0].prompt,
    );
    expect(document.querySelector('audio')).toBeNull();
    expect(screen.queryByTestId('demo-clone-try')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(props.addFiles).not.toHaveBeenCalled();
    expect(props.onSelectSample).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'de' } });
    fireEvent.click(screen.getByTestId('demo-clone-try'));
    await waitFor(() => expect(props.addFiles).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/demo-clones/voxtral-3/heike-reference.mp3',
    );
    expect(props.onSelectSample).toHaveBeenCalledExactlyOnceWith({
      locale: 'de',
      prompt: 'Ach, da bist du ja genau im richtigen Moment.',
    });
  });

  it('defaults an uncovered dashboard route locale to English', () => {
    renderSample('da');
    expect(screen.getByTestId('demo-clone-language')).toHaveValue('en');
    expect(screen.getAllByRole('option')[0]).toHaveValue('en');
    expect(screen.getByTestId('demo-clone-try')).toBeEnabled();
    expect(document.querySelector('audio')).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/kat-natural.mp3',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('hands off Kat’s reference and full passage for Same as original', async () => {
    fetchMock.mockResolvedValue(
      new Response('sample', { headers: { 'content-type': 'audio/mpeg' } }),
    );
    renderSample();
    fireEvent.click(screen.getByRole('radio', { name: 'Same as original' }));
    fireEvent.click(screen.getByTestId('demo-clone-try'));
    expect(screen.getByTestId('demo-clone-try')).toBeDisabled();
    await waitFor(() => expect(props.addFiles).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/demo-clones/voxtral-3/kat-reference.mp3',
    );
    expect(props.onSelectSample).toHaveBeenCalledExactlyOnceWith({
      locale: 'en',
      prompt:
        'Downtown Drugstore had a bell on the door that made a single tink sound when you opened it.\nOxford Pharmacy had two bells on its doors, so it was more of a ta-tank, though nothing to startle over.',
    });
    const [file] = props.addFiles.mock.calls[0][0] as File[];
    expect(file.name).toBe('kat-reference.mp3');
    expect(file.type).toBe('audio/mpeg');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('loads the matching German reference, language, and tagged text', async () => {
    fetchMock.mockResolvedValue(
      new Response('sample', { headers: { 'content-type': 'audio/mpeg' } }),
    );
    renderSample();
    fireEvent.change(screen.getByTestId('demo-clone-language'), {
      target: { value: 'de' },
    });
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
