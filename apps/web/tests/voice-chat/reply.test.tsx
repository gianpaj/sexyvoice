// @vitest-environment jsdom
import { cleanup, render, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { VoiceChatReply } from '@/components/call/voice-chat-reply';

afterEach(cleanup);

it('formats a phrase while the closing marker is still arriving', () => {
  const view = render(
    <VoiceChatReply paced={false} streaming text="Son **$415 por acción*" />,
  );
  expect(view.container.textContent).toBe('Son $415 por acción');
  expect(view.container.querySelector('strong')?.textContent).toBe(
    '$415 por acción',
  );

  view.rerender(
    <VoiceChatReply paced={false} text="Son **$415 por acción** y *así*." />,
  );
  expect(view.container.textContent).toBe('Son $415 por acción y así.');
  expect(view.container.querySelector('em')?.textContent).toBe('así');
});

it('preserves unmatched and escaped markers and ignores raw HTML', () => {
  const { container } = render(
    <VoiceChatReply
      paced={false}
      text={String.raw`2 * 3, \*literal\*, **unfinished <b>text</b>`}
    />,
  );
  expect(container.textContent).toBe('2 * 3, *literal*, **unfinished text');
  expect(container.querySelector('strong, b')).toBeNull();
});

it('keeps paragraphs and link labels without loading media or linking out', () => {
  const { container } = render(
    <VoiceChatReply
      paced={false}
      text={
        'First paragraph.\n\nSecond [paragraph](https://example.com). ![image](https://example.com/example.png)'
      }
    />,
  );
  const paragraphs = Array.from(
    container.querySelectorAll('p'),
    ({ textContent }) => textContent?.trim(),
  );
  expect(paragraphs).toEqual(['First paragraph.', 'Second paragraph.']);
  expect(container.querySelector('img, a')).toBeNull();
});

it.each([
  { paced: false, streaming: false },
  { paced: false, streaming: true },
  { paced: true, streaming: true },
])('preserves Markdown lists with %o', async (mode) => {
  const view = render(
    <VoiceChatReply
      {...mode}
      text={
        '1. Give me a call\n2. Send me a message\n\n- One more thing\n- Last item'
      }
    />,
  );

  await waitFor(
    () => {
      const [ordered, unordered] = view.getAllByRole('list');
      expect(
        within(ordered)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Give me a call', 'Send me a message']);
      expect(
        within(unordered)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['One more thing', 'Last item']);
    },
    { timeout: 3000 },
  );
});
