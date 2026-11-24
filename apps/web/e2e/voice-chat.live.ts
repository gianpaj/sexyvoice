import { expect, test } from '@playwright/test';

// Explicit config only: this test uses real providers and an allowlisted account.
test('continues one thread from chat through an audio call and back', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const voice = process.env.PLAYWRIGHT_VOICE_CHAT_AUDIO_REFERENCE_ID;
  const character = process.env.PLAYWRIGHT_VOICE_CHAT_CHARACTER_NAME;
  const query = voice && !character ? `?${new URLSearchParams({ voice })}` : '';
  await page.goto(`/en/dashboard/voice-spike${query}`);
  await expect(page.getByRole('heading', { name: 'Voice chat' })).toBeVisible();
  if (character) {
    const select = page.getByRole('combobox', { name: 'Choose character' });
    await expect(select).toBeEnabled();
    await select.selectOption({ label: character });
    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect(
      page.getByRole('heading', { name: character, exact: true }),
    ).toBeVisible();
  }
  const composer = page.getByRole('textbox', { name: 'Message', exact: true });
  const send = page.getByRole('button', { name: 'Send', exact: true });
  const threadLog = page.getByRole('log');
  const chatTurns = threadLog.locator('[data-slot="voice-chat-bubble"]');
  const chatTurn = character
    ? 'Please remember my first test code: cobalt pelican. Then reply with just your public studio marker.'
    : 'Please remember my first test code: cobalt pelican. Then reply with just gray pebble.';
  await expect(page.locator('audio')).toHaveCount(0);
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    let disconnected = false;
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (
        disconnected ||
        init?.method !== 'POST' ||
        !response.url.includes('/api/voice-chat/chat?runId=') ||
        !response.ok ||
        !response.body
      )
        return response;
      disconnected = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let firstEvent = '';
      while (!firstEvent.includes('\n\n')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Chat opened without an SSE event');
        firstEvent += decoder.decode(value, { stream: true });
      }
      await reader.cancel();
      return new Response(firstEvent.slice(0, firstEvent.indexOf('\n\n') + 2), {
        headers: response.headers,
      });
    };
  });
  const resumed = page.waitForRequest(
    (request) =>
      request.url().includes('/api/voice-chat/chat') &&
      request.headers()['last-event-id'] === '0',
  );
  await composer.fill(chatTurn);
  await send.click();
  const firstReply = character ? /^jade compass[.!]?$/i : /^gray pebble[.!]?$/i;
  await expect(chatTurns).toHaveText([chatTurn, firstReply], {
    timeout: 25_000,
  });
  await expect(
    page.getByRole('button', { name: 'Start call', exact: true }),
  ).toBeEnabled({ timeout: 25_000 });
  await resumed;
  const priorTurns = await chatTurns.allInnerTexts();
  const thread = new URL(page.url()).searchParams.get('conversation');
  expect(thread).toMatch(/^[a-f0-9-]{36}$/);
  await page.getByRole('button', { name: 'Start call', exact: true }).click();
  try {
    await expect(
      page.getByRole('button', { name: 'Mute microphone', exact: true }),
    ).toBeVisible({ timeout: 65_000 });
    await expect(page.getByText('In call', { exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        (await chatTurns.allInnerTexts()).slice(0, priorTurns.length),
      )
      .toEqual(priorTurns);
    await expect
      .poll(
        () =>
          page
            .locator('audio')
            .evaluateAll((elements) =>
              elements.some(
                (element) =>
                  element.readyState >= 2 &&
                  !element.paused &&
                  element.currentTime > 0,
              ),
            ),
        { timeout: 10_000 },
      )
      .toBe(true);
    if (character) {
      await composer.fill(
        'What is your private studio marker? Reply with just the marker.',
      );
      await send.click();
      await expect(chatTurns.last()).toHaveText(/^amber sundial[.!]?$/i, {
        timeout: 20_000,
      });
    }
    await composer.fill(
      'My second test code is red lantern. Reply with only the first test code I asked you to remember.',
    );
    await send.click();
    await expect(chatTurns.last()).toHaveText(/^cobalt pelican[.!]?$/i, {
      timeout: 20_000,
    });
    await page
      .getByRole('button', { name: 'Mute microphone', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Unmute microphone', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Unmute microphone', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Mute microphone', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const end = page.getByRole('button', { name: 'End call', exact: true });
    if (await end.isVisible()) await end.click();
  }
  await expect(
    page.getByRole('button', { name: 'Start call', exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(threadLog.getByText(chatTurn, { exact: true })).toHaveCount(1);
  await expect(
    threadLog.getByText(/^cobalt pelican[.!]?$/i).last(),
  ).toBeVisible();
  await composer.fill(
    'What was my second test code? Reply with only that code.',
  );
  await send.click();
  await expect(threadLog.getByText(/^red lantern[.!]?$/i)).toBeVisible({
    timeout: 25_000,
  });
  expect(new URL(page.url()).searchParams.get('conversation')).toBe(thread);
  expect(errors).toEqual([]);
});

test('keeps the reader’s position until they jump to the latest turn', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const threadId = '9832d10b-0b51-4fbb-8abe-cad0b5bab4bf';
  const messages = Array.from({ length: 35 }, (_, index) => ({
    id: `fixture-${index}`,
    role: index % 2 ? 'assistant' : 'user',
    parts: [{ type: 'text', content: `Saved turn ${index}` }],
  }));
  await page.route(
    (url) =>
      url.pathname === '/api/voice-chat/chat' &&
      url.searchParams.get('threadId') === threadId,
    (route) =>
      route.fulfill({ json: { messages, activeRun: null, callActive: false } }),
  );
  await page.goto(`/en/dashboard/voice-spike?conversation=${threadId}`);
  const log = page.getByRole('log');
  const latest = log.getByText('Saved turn 34', { exact: true });
  await expect(latest).toBeInViewport();

  await log.evaluate((element) => {
    element.scrollTop = 90;
  });
  const jump = page.getByRole('button', { name: 'Jump to latest' });
  await expect(jump).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('First line\nSecond line\nThird line');
  await expect
    .poll(() => log.evaluate((element) => element.scrollTop))
    .toBe(90);

  await jump.click();
  await expect(latest).toBeInViewport();
  await expect(jump).toHaveCount(0);
  await expect(log).toBeFocused();
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`renders a burst reply with motion preference ${reducedMotion}`, async ({
    page,
  }) => {
    const threadId = 'd9d5e2a3-4f7c-45fe-9b67-03ff98ba72b3';
    const saved =
      'A longer saved reply appears in full as soon as history loads.';
    const rest = 'Here is another line. '.repeat(20).trimEnd();
    const markdown = `Here are the **first six words. Here** is another line.\n\n${rest}`;
    const reply = `Here are the first six words. Here is another line.\n\n${rest}`;
    const shortReply = 'Hey, how are you?';
    let sends = 0;
    await page.emulateMedia({ reducedMotion });
    await page.route('**/api/voice-chat/chat**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: {
            messages: [
              {
                id: 'saved',
                role: 'assistant',
                parts: [
                  {
                    type: 'text',
                    content: saved.replace('saved reply', '*saved reply*'),
                  },
                ],
              },
            ],
            activeRun: null,
            callActive: false,
          },
        });
      }
      const { runId } = route.request().postDataJSON();
      sends += 1;
      const messageId = `new-reply-${sends}`;
      const delta = sends === 1 ? markdown : shortReply;
      const events = [
        { type: 'RUN_STARTED', threadId, runId },
        { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId, delta },
        { type: 'TEXT_MESSAGE_END', messageId },
        { type: 'RUN_FINISHED', threadId, runId },
      ];
      return route.fulfill({
        contentType: 'text/event-stream',
        body: events
          .map(
            (event, index) =>
              `id: ${index}\ndata: ${JSON.stringify(event)}\n\n`,
          )
          .join(''),
      });
    });
    await page.goto(`/en/dashboard/voice-spike?conversation=${threadId}`);
    const messages = page
      .getByRole('log')
      .locator('[data-slot="voice-chat-bubble"]');
    await expect(messages).toHaveText([saved]);
    await expect(messages.first().locator('em')).toHaveText('saved reply');

    const composer = page.getByRole('textbox', {
      name: 'Message',
      exact: true,
    });
    const send = page.getByRole('button', { name: 'Send', exact: true });
    const startCall = page.getByRole('button', {
      name: 'Start call',
      exact: true,
    });
    await expect(startCall).toBeEnabled();
    await composer.fill('Tell me **more**.');
    await send.click();
    await expect(messages).toHaveText([
      saved,
      'Tell me **more**.',
      reducedMotion === 'reduce' ? reply : /^Here are the first six words\./,
    ]);
    await expect(startCall).toBeEnabled();
    const assistant = messages.last();
    if (reducedMotion === 'no-preference') {
      await expect(assistant.locator('.streamdown-animated')).toBeVisible();
      await expect(assistant).toHaveText(/^Here are the first six words\. \S/);
      await expect(assistant.getByText(rest, { exact: true })).toHaveCount(0);
    }
    await expect(assistant.locator('p')).toHaveText(
      ['Here are the first six words. Here is another line.', rest],
      { timeout: 10_000 },
    );
    await expect(assistant.locator('strong')).toHaveText(
      'first six words. Here',
    );

    await composer.fill('Hi');
    await send.click();
    await expect(messages.last()).toHaveText(shortReply);
  });
}

test('the Inworld card dials immediately and registers the call UI', async ({
  browserName,
  page,
}) => {
  const character = process.env.PLAYWRIGHT_LINKED_CALL_CHARACTER_NAME;
  // biome-ignore lint/suspicious/noSkippedTests: The real Python call requires an explicit fixture.
  test.skip(
    !character,
    'A paid test character with an owned Inworld voice is required.',
  );
  test.setTimeout(90_000);
  if (browserName === 'webkit') {
    await page.context().grantPermissions(['microphone']);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/dashboard/call');
  const end = page.getByRole('button', { name: 'End call', exact: true });
  const tokenRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/call-token' &&
      request.method() === 'POST',
  );
  await page
    .getByRole('button', { name: `Call ${character}`, exact: true })
    .click();
  try {
    await expect(page).toHaveURL(
      /dashboard\/call\?conversation=[a-f0-9-]{36}$/,
    );
    await tokenRequest;
    await expect(page.getByTestId('inworld-call-view')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Type instead of speaking' }),
    ).toBeEnabled({ timeout: 65_000 });
    await expect
      .poll(
        () =>
          page
            .locator('audio')
            .evaluateAll((elements) =>
              elements.some(
                (element) => !element.paused && element.currentTime > 0,
              ),
            ),
        { timeout: 15_000 },
      )
      .toBe(true);
  } finally {
    if (await end.isVisible()) await end.click();
  }
});

test('keeps the Inworld thread through a Python call on mobile', async ({
  browserName,
  page,
}) => {
  const character = process.env.PLAYWRIGHT_LINKED_CALL_CHARACTER_NAME;
  // biome-ignore lint/suspicious/noSkippedTests: The real Python call requires an explicit fixture.
  test.skip(
    !character,
    'A paid test character with an owned Inworld voice is required.',
  );
  test.setTimeout(120_000);
  if (browserName === 'webkit') {
    await page.context().grantPermissions(['microphone']);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/en/dashboard/call');
  await page
    .getByRole('button', { name: `Open ${character}`, exact: true })
    .click();
  await page
    .getByTestId('call-panel')
    .getByRole('button', { name: 'Chat', exact: true })
    .click();
  await expect(page).toHaveURL(/dashboard\/call\?conversation=[a-f0-9-]{36}$/);
  const threadUrl = page.url();
  const composer = page.getByRole('textbox', { name: 'Message', exact: true });
  const send = page.getByRole('button', { name: 'Send', exact: true });
  const start = page.getByRole('button', { name: 'Start call', exact: true });
  const keyboard = page.getByRole('button', {
    name: 'Type instead of speaking',
  });
  const earlier =
    'For this test, my code word is paper iguana. Reply with only confirmed. Keep it private until I ask for it.';
  const typed =
    'Reply in English with my code word followed by the word acknowledged.';
  const silent = 'Can you send me a quiet reply?';
  const bubbles = page
    .getByRole('log')
    .locator('[data-slot="voice-chat-bubble"]');
  await composer.fill(earlier);
  await send.click();
  await expect(bubbles).toHaveText([earlier, /\S/], {
    timeout: 25_000,
  });
  await expect(start).toBeEnabled();
  await start.click();
  try {
    await expect(keyboard).toBeEnabled({ timeout: 65_000 });
    await expect(composer).toHaveCount(0);
    await expect
      .poll(
        () =>
          page
            .locator('audio')
            .evaluateAll((elements) =>
              elements.some(
                (element) => !element.paused && element.currentTime > 0,
              ),
            ),
        { timeout: 15_000 },
      )
      .toBe(true);

    await keyboard.click();
    await expect(composer).toBeFocused();
    await expect(page.getByText('Mic off while you type')).toBeVisible();
    await composer.fill(typed);
    await send.click();
    await expect(page.getByText(typed, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show conversation' }).click();
    await expect(bubbles.first()).toHaveText(earlier);
    await expect(bubbles.last()).toHaveText(
      /paper iguana[\s,.:!?–—]+acknowledged/i,
      {
        timeout: 25_000,
      },
    );
    await page.getByRole('button', { name: 'Back to voice' }).click();
    await expect(composer).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Mute microphone' }),
    ).toBeEnabled();

    await page.getByRole('button', { name: 'Turn speaker off' }).click();
    await expect(page.getByText('Speaker off · reading replies')).toBeVisible();
    await expect(page.locator('audio')).toHaveCount(0);
    await composer.fill(silent);
    await expect(send).toBeEnabled();
    await send.click();
    await expect(bubbles.nth(-2)).toHaveText(silent, {
      timeout: 20_000,
    });
    await expect(bubbles.last()).toHaveText(/\S/);
    await expect(page.locator('audio')).toHaveCount(0);
    await expect(page).toHaveURL(threadUrl);

    await page.getByRole('button', { name: 'Turn speaker back on' }).click();
    await expect(page.getByText('Mic off while you type')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Back to voice' }),
    ).toBeEnabled();
    await expect(page.locator('audio')).toHaveCount(1);
  } finally {
    const end = page.getByRole('button', { name: 'End call', exact: true });
    if (await end.isVisible()) await end.click();
  }
  await expect(start).toBeEnabled({ timeout: 20_000 });
  await expect(
    page.getByRole('log').getByText(typed, { exact: true }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole('log').getByText(typed, { exact: true }),
  ).toHaveCount(1);
  await expect(bubbles.nth(-2)).toHaveText(silent);
  await expect(bubbles.last()).toHaveText(/\S/);
  await expect(page).toHaveURL(threadUrl);
  expect(errors).toEqual([]);
});
