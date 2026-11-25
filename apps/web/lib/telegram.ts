import { createHmac, timingSafeEqual } from 'node:crypto';

/** The admin's private chat with the bot. Its ID equals the admin's user ID. */
export const TELEGRAM_ADMIN_CHAT_ID = 202_637_584;

// A Mini App sends its init data once, when it opens, so a short window is
// enough and limits replay of leaked init data.
const INIT_DATA_MAX_AGE_SECONDS = 60 * 60;

/** Reads the bot token from `TELEGRAM_WEBHOOK_URL` (`.../bot<token>/sendMessage`). */
export function getTelegramBotToken(): string | null {
  return process.env.TELEGRAM_WEBHOOK_URL?.match(/\/bot([^/]+)\//)?.[1] ?? null;
}

/**
 * Returns the Telegram user ID in Mini App init data, or null unless the bot
 * signed the data in the last hour.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  now = Date.now(),
): number | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  // Compare hex text: decoding the received hash would drop invalid or
  // trailing characters and accept a modified hash.
  const expected = Buffer.from(
    createHmac('sha256', secretKey).update(dataCheckString).digest('hex'),
  );
  const received = Buffer.from(hash);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }

  const authDate = Number(params.get('auth_date'));
  if (!(now / 1000 - authDate <= INIT_DATA_MAX_AGE_SECONDS)) return null;

  const user = JSON.parse(params.get('user') ?? 'null') as {
    id?: unknown;
  } | null;
  return typeof user?.id === 'number' ? user.id : null;
}
