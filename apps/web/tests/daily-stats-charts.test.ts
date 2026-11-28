import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  baselineAverage,
  buildDailyChartRows,
} from '@/app/api/daily-stats/charts';
import { GET } from '@/app/api/daily-stats/charts/route';
import { VOICE_CLONING_MODELS } from '@/lib/clone/constants';
import { TELEGRAM_ADMIN_CHAT_ID } from '@/lib/telegram';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(() => ({ client: 'admin' })),
  getAudioFilesInRange: vi.fn(async () => []),
  getCallSessionsInRange: vi.fn(async () => []),
  getCreditTransactionsInRange: vi.fn(async () => []),
  getInternalUserIds: vi.fn(async () => ['internal-1']),
  getProfilesInRange: vi.fn(async () => []),
}));

// tests/setup.ts mocks next/server; the route needs the real NextResponse.
vi.unmock('next/server');
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/app/api/daily-stats/queries', () => ({
  getAudioFilesInRange: mocks.getAudioFilesInRange,
  getCallSessionsInRange: mocks.getCallSessionsInRange,
  getCreditTransactionsInRange: mocks.getCreditTransactionsInRange,
  getInternalUserIds: mocks.getInternalUserIds,
  getProfilesInRange: mocks.getProfilesInRange,
}));

const CLONE_MODEL = VOICE_CLONING_MODELS[0] ?? '';

describe('buildDailyChartRows', () => {
  it('totals each metric per UTC day and fills empty days', () => {
    const rows = buildDailyChartRows(
      {
        audioFiles: [
          { created_at: '2026-09-09T10:00:00+00:00', model: 'gpro' },
          { created_at: '2026-09-09T11:00:00+00:00', model: CLONE_MODEL },
          { created_at: null, model: 'gpro' },
        ],
        calls: [
          {
            duration_seconds: 90,
            free_call: true,
            started_at: '2026-09-09T23:59:59+00:00',
          },
          {
            duration_seconds: 31,
            free_call: false,
            started_at: '2026-09-10T00:30:00+01:00',
          },
          {
            duration_seconds: 0,
            free_call: false,
            started_at: '2026-09-09T18:00:00+00:00',
          },
          {
            duration_seconds: 30,
            free_call: null,
            started_at: '2026-09-11T00:00:00+00:00',
          },
        ],
        creditTransactions: [
          {
            created_at: '2026-09-11T08:00:00+00:00',
            metadata: { dollarAmount: 10 },
          },
          {
            created_at: '2026-09-11T09:00:00+00:00',
            metadata: { dollarAmount: -2.5 },
          },
          {
            created_at: '2026-09-11T10:00:00+00:00',
            metadata: { reason: 'chargeback_dispute' },
          },
        ],
        profiles: [{ created_at: '2026-09-10T12:00:00+00:00' }],
      },
      new Date('2026-09-09T00:00:00Z'),
      3,
    );

    expect(rows).toEqual([
      {
        audio: 1,
        callMinutes: 2,
        calls: 3,
        clonedAudio: 1,
        date: '2026-09-09',
        freeCallMinutes: 1.5,
        freeCalls: 1,
        paidCallMinutes: 31 / 60,
        paidCalls: 2,
        profiles: 0,
        revenueUsd: 0,
      },
      {
        audio: 0,
        callMinutes: 0,
        calls: 0,
        clonedAudio: 0,
        date: '2026-09-10',
        freeCallMinutes: 0,
        freeCalls: 0,
        paidCallMinutes: 0,
        paidCalls: 0,
        profiles: 1,
        revenueUsd: 0,
      },
      {
        audio: 0,
        callMinutes: 0.5,
        calls: 1,
        clonedAudio: 0,
        date: '2026-09-11',
        freeCallMinutes: 0,
        freeCalls: 0,
        paidCallMinutes: 0.5,
        paidCalls: 1,
        profiles: 0,
        revenueUsd: 7.5,
      },
    ]);
  });
});

describe('baselineAverage', () => {
  // Oldest first; the last value is yesterday.
  const totals = [100, 1, 2, 3, 10];

  it('averages the days before yesterday, like the Calls section', () => {
    expect(baselineAverage(totals, 3, false)).toBe(2);
  });

  it('includes yesterday, like the revenue, audio and profile lines', () => {
    expect(baselineAverage(totals, 3, true)).toBe(5);
  });

  it('returns 0 without data', () => {
    expect(baselineAverage([], 14, true)).toBe(0);
  });
});

const BOT_TOKEN = '123456:test-token';

// Signs init data the way Telegram does for a Mini App.
function initData(userId: number) {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId }),
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();
  const hash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const request = (authorization?: string) =>
  new NextRequest('https://sexyvoice.test/api/daily-stats/charts', {
    headers: authorization ? { authorization } : {},
  });

describe('GET /api/daily-stats/charts', () => {
  beforeEach(() => {
    vi.stubEnv(
      'TELEGRAM_WEBHOOK_URL',
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['no Authorization header', undefined],
    ['another scheme', `Bearer ${initData(TELEGRAM_ADMIN_CHAT_ID)}`],
    ['another Telegram user', `tma ${initData(TELEGRAM_ADMIN_CHAT_ID + 1)}`],
  ])('returns 401 for %s before reading data', async (_, authorization) => {
    const response = await GET(request(authorization));

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 401 when the bot token is missing', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_URL', '');

    const response = await GET(
      request(`tma ${initData(TELEGRAM_ADMIN_CHAT_ID)}`),
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 30 days for the admin, excluding internal users', async () => {
    const response = await GET(
      request(`tma ${initData(TELEGRAM_ADMIN_CHAT_ID)}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.baselineDays).toBe(14);
    expect(body.days).toHaveLength(30);
    expect(mocks.getCallSessionsInRange).toHaveBeenCalledWith(
      { client: 'admin' },
      expect.any(Date),
      expect.any(Date),
      ['internal-1'],
    );
  });
});
