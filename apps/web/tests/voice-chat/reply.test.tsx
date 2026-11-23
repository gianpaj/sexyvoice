// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
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

it('preserves escaped and unmatched markers and renders HTML as text', () => {
  const { container } = render(
    <VoiceChatReply
      paced={false}
      text={String.raw`2 * 3, \*literal\*, **unfinished <b>text</b>`}
    />,
  );
  expect(container.textContent).toBe(
    '2 * 3, *literal*, **unfinished <b>text</b>',
  );
  expect(container.children).toHaveLength(0);
});
