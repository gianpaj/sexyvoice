import { expect, test } from '@playwright/test';

// Explicit config only: this test uses real providers and an allowlisted account.
test('continues one thread from chat through an audio call and back', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const voice = process.env.PLAYWRIGHT_VOICE_SPIKE_AUDIO_REFERENCE_ID;
  const query = voice ? `?${new URLSearchParams({ voice })}` : '';
  await page.goto(`/en/dashboard/voice-spike${query}`);
  await expect(
    page.getByRole('heading', { name: 'JS call demo' }),
  ).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'Message', exact: true });
  const send = page.getByRole('button', { name: 'Send', exact: true });
  const threadLog = page.getByRole('log');
  const chatTurns = threadLog.locator('p:not([role="status"])');
  const chatTurn = 'Please remember my first test code: cobalt pelican.';
  await expect(page.locator('audio')).toHaveCount(0);
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    let disconnected = false;
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (
        disconnected ||
        init?.method !== 'POST' ||
        !response.url.includes('/api/voice-spike/chat?runId=') ||
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
      request.url().includes('/api/voice-spike/chat') &&
      request.headers()['last-event-id'] === '0',
  );
  await composer.fill(chatTurn);
  await send.click();
  await expect(chatTurns).toHaveText([chatTurn, /\S/], { timeout: 25_000 });
  await expect(
    page.getByRole('button', { name: 'Start call', exact: true }),
  ).toBeEnabled({ timeout: 25_000 });
  await resumed;
  const priorTurns = await chatTurns.allTextContents();
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
        (await chatTurns.allTextContents()).slice(0, priorTurns.length),
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
    await composer.fill(
      'My second test code is red lantern. Reply with only the first test code I asked you to remember.',
    );
    await send.click();
    await expect(threadLog.locator('p').last()).toHaveText(
      /^cobalt pelican[.!]?$/i,
      { timeout: 20_000 },
    );
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
