import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendTelegramMessage, verifyTelegramInitData } from '@/lib/telegram';

const BOT_TOKEN = '123456:test-token';
const NOW = Date.UTC(2026, 10, 25, 12);
const nowSeconds = NOW / 1000;

// Signs init data the way Telegram does for a Mini App.
function sign(fields: Record<string, string>, botToken = BOT_TOKEN) {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const hash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const fields = {
  auth_date: String(nowSeconds - 60),
  query_id: 'AAE',
  signature: 'sig',
  user: JSON.stringify({ first_name: 'Admin', id: 42 }),
};

describe('verifyTelegramInitData', () => {
  it('returns the user ID for init data the bot signed', () => {
    expect(verifyTelegramInitData(sign(fields), BOT_TOKEN, NOW)).toBe(42);
  });

  it('rejects data signed for another bot', () => {
    expect(
      verifyTelegramInitData(sign(fields, '999:other'), BOT_TOKEN, NOW),
    ).toBeNull();
  });

  it('rejects tampered data', () => {
    const tampered = sign(fields).replace('%22id%22%3A42', '%22id%22%3A43');
    expect(verifyTelegramInitData(tampered, BOT_TOKEN, NOW)).toBeNull();
  });

  it.each(['a trailing character', 'a non-hex character'])(
    'rejects a hash with %s',
    (variant) => {
      const params = new URLSearchParams(sign(fields));
      const hash = params.get('hash') ?? '';
      params.set(
        'hash',
        variant === 'a trailing character'
          ? `${hash}0`
          : `${hash.slice(0, -1)}z`,
      );
      expect(
        verifyTelegramInitData(params.toString(), BOT_TOKEN, NOW),
      ).toBeNull();
    },
  );

  it('rejects data older than an hour', () => {
    const stale = sign({ ...fields, auth_date: String(nowSeconds - 3601) });
    expect(verifyTelegramInitData(stale, BOT_TOKEN, NOW)).toBeNull();
  });

  it('rejects data dated more than a minute in the future', () => {
    const future = sign({ ...fields, auth_date: String(nowSeconds + 61) });
    expect(verifyTelegramInitData(future, BOT_TOKEN, NOW)).toBeNull();
  });

  it('accepts data dated within a minute of clock skew', () => {
    const skewed = sign({ ...fields, auth_date: String(nowSeconds + 30) });
    expect(verifyTelegramInitData(skewed, BOT_TOKEN, NOW)).toBe(42);
  });

  it('rejects signed data whose user is not JSON', () => {
    const malformed = sign({ ...fields, user: '{not json' });
    expect(verifyTelegramInitData(malformed, BOT_TOKEN, NOW)).toBeNull();
  });

  it('rejects data without a hash', () => {
    const unsigned = new URLSearchParams(fields).toString();
    expect(verifyTelegramInitData(unsigned, BOT_TOKEN, NOW)).toBeNull();
  });
});

describe('sendTelegramMessage', () => {
  const WEBHOOK = 'https://api.telegram.org/bot123/sendMessage';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the message as JSON', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage(WEBHOOK, { chat_id: 1, text: 'hi' });

    expect(fetchMock).toHaveBeenCalledWith(
      WEBHOOK,
      expect.objectContaining({
        body: JSON.stringify({ chat_id: 1, text: 'hi' }),
        method: 'POST',
      }),
    );
  });

  it.each([
    [
      'Telegram rejects the message',
      new Response(
        JSON.stringify({
          description: 'Bad Request: BUTTON_TYPE_INVALID',
          ok: false,
        }),
        { status: 400 },
      ),
    ],
    ['the response is not JSON', new Response('Bad Gateway', { status: 502 })],
  ])('throws when %s', async (_, response) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    await expect(
      sendTelegramMessage(WEBHOOK, { chat_id: 1, text: 'hi' }),
    ).rejects.toThrow('Telegram rejected the message');
  });
});
