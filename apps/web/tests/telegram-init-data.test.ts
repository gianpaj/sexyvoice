import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyTelegramInitData } from '@/lib/telegram';

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

  it('rejects data without a hash', () => {
    const unsigned = new URLSearchParams(fields).toString();
    expect(verifyTelegramInitData(unsigned, BOT_TOKEN, NOW)).toBeNull();
  });
});
