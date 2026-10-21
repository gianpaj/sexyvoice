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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DemoClonePlayer } from '@/components/demo-clone/demo-clone-player';
import messages from '@/messages/en.json';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: { pathname: string; query: Record<string, string> };
    children: React.ReactNode;
  }) => (
    <a href={`${href.pathname}?${new URLSearchParams(href.query)}`} {...props}>
      {children}
    </a>
  ),
}));

const labels = messages.landing.demoClone;
const props = {
  initialSpeakerId: 'kat',
  labels,
  languageLabels: { en: 'English', de: 'German' },
};
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const audio = () => document.querySelector('audio')!;
const selectTake = (id: string) =>
  fireEvent.click(
    document.querySelector(`input[name="demo-clone-take"][value="${id}"]`)!,
  );

describe('Hear the difference', () => {
  it('starts ready without autoplay and preserves words across the three takes', () => {
    render(<DemoClonePlayer {...props} />);
    expect(screen.getByTestId('demo-clone-result')).toHaveAttribute(
      'data-take-id',
      'natural',
    );
    const sentence = screen.getByTestId('demo-clone-script').textContent;
    for (const take of ['sarcastic', 'calmSlow', 'natural']) {
      selectTake(take);
      expect(audio().getAttribute('src')).toBe(
        `/demo-clones/voxtral-3/kat-${take}.mp3`,
      );
      expect(screen.getByTestId('demo-clone-script').textContent).toBe(
        sentence,
      );
    }
    expect(play).not.toHaveBeenCalled();
  });

  it('pauses at the current position and resumes the same clip', async () => {
    render(<DemoClonePlayer {...props} />);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    await screen.findByLabelText(labels.pauseAudio);
    audio().currentTime = 1;
    fireEvent.timeUpdate(audio());
    fireEvent.click(screen.getByLabelText(labels.pauseAudio));
    expect(pause).toHaveBeenCalled();
    expect(audio().currentTime).toBe(1);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });

  it('stops playing when the voice or delivery changes', async () => {
    const { unmount } = render(<DemoClonePlayer {...props} />);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    await screen.findByLabelText(labels.pauseAudio);
    audio().currentTime = 1;
    selectTake('calmSlow');
    expect(audio().currentTime).toBe(0);
    fireEvent.click(screen.getByTestId('demo-clone-speaker-heike'));
    expect(audio().getAttribute('src')).toContain('heike-calmSlow.mp3');
    expect(screen.getByTestId('demo-clone-try')).toHaveAttribute(
      'href',
      '/dashboard/clone?demo=heike&take=calmSlow',
    );
    expect(play).toHaveBeenCalledOnce();
    const before = pause.mock.calls.length;
    unmount();
    expect(pause.mock.calls.length).toBeGreaterThan(before);
  });

  it('ignores a play promise rejected after changing the selection', async () => {
    let rejectPlay: (error: Error) => void = () => {};
    play.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPlay = reject;
        }),
    );
    render(<DemoClonePlayer {...props} />);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    selectTake('sarcastic');
    await act(async () =>
      rejectPlay(new DOMException('interrupted', 'AbortError')),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText(labels.playAudio)).toBeInTheDocument();
  });

  it('plays the original through the same element and returns to the selected take', async () => {
    render(<DemoClonePlayer {...props} />);
    selectTake('sarcastic');
    const element = audio();
    fireEvent.click(screen.getByText(labels.hearOriginal));
    await screen.findByLabelText(labels.pauseAudio);
    expect(audio()).toBe(element);
    expect(audio().getAttribute('src')).toContain('kat-reference.mp3');
    fireEvent.click(screen.getByText(labels.backToClone));
    await screen.findByLabelText(labels.pauseAudio);
    expect(audio().getAttribute('src')).toContain('kat-sarcastic.mp3');
  });

  it('offers retry on a real playback failure', async () => {
    play.mockRejectedValueOnce(
      new DOMException('No audio', 'NotSupportedError'),
    );
    render(<DemoClonePlayer {...props} />);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      labels.audioError,
    );
    fireEvent.click(screen.getByText(labels.retry));
    await screen.findByLabelText(labels.pauseAudio);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('passes the exact selected delivery to the dashboard action', () => {
    const onTryVoice = vi.fn();
    const { rerender } = render(
      <DemoClonePlayer {...props} onTryVoice={onTryVoice} />,
    );
    selectTake('calmSlow');
    fireEvent.click(screen.getByTestId('demo-clone-try'));
    expect(onTryVoice).toHaveBeenCalledWith('kat', 'calmSlow');
    rerender(<DemoClonePlayer {...props} applying onTryVoice={onTryVoice} />);
    expect(screen.getByTestId('demo-clone-try')).toBeDisabled();
  });
});
