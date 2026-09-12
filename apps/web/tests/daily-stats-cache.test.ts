import assert from 'node:assert/strict';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/daily-stats/route';

const mocks = vi.hoisted(() => ({
  captureCheckIn: vi.fn(() => 'test-check-in'),
  captureException: vi.fn(),
  createAdminClient: vi.fn(),
  existsSync: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  from: vi.fn(),
  getContributionData: vi.fn(),
  getUserIdByStripeCustomerId: vi.fn(),
  queries: {
    getAllCreditTransactions: vi.fn().mockResolvedValue([]),
    getAudioFilesInRange: vi.fn().mockResolvedValue([]),
    getCallSessionDurationsBefore: vi.fn().mockResolvedValue([]),
    getCallSessionsInRange: vi.fn().mockResolvedValue([]),
    getClonedAudioFilesInRange: vi.fn().mockResolvedValue([]),
    getInternalUserIds: vi.fn().mockResolvedValue([]),
    getProfilesInRange: vi.fn().mockResolvedValue([]),
    getProfileUsernamesByIds: vi.fn().mockResolvedValue([]),
    getUsageEventsInRange: vi.fn().mockResolvedValue([]),
  },
  readFileSync: vi.fn(),
  redis: {
    countActiveCustomerSubscriptions: vi.fn().mockResolvedValue(0),
    findNextSubscriptionDueForPayment: vi.fn().mockResolvedValue(null),
    getActiveSubscriptionsMrr: vi.fn().mockResolvedValue(null),
  },
  writeFileSync: vi.fn(),
}));

// Exercise real request parsing and response headers, not the setup mock.
vi.unmock('next/server');

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
}));
vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: mocks.captureCheckIn,
  captureException: mocks.captureException,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/supabase/queries', () => ({
  getUserIdByStripeCustomerId: mocks.getUserIdByStripeCustomerId,
}));
vi.mock('@/lib/redis/queries', () => mocks.redis);
vi.mock('@/app/api/daily-stats/queries', () => mocks.queries);
vi.mock('@/app/api/daily-stats/contribution-queries', () => ({
  getContributionData: mocks.getContributionData,
}));

const CACHE_FILE = join(process.cwd(), '.daily-stats-cache.json');
const REPORT_DATE = '2026-09-12';
const WEBHOOK = 'https://telegram.invalid/daily-stats';

function validCache() {
  const emptyResult = { count: 0, data: [], error: null };
  return {
    activeSubscribersCount: 0,
    allCreditTransactions: [],
    allTimePurchaseTransactions: [],
    apiKeysYesterdayResult: emptyResult,
    audio14dResult: emptyResult,
    audioTotalCountResult: emptyResult,
    audioYesterdayResult: emptyResult,
    callSessions14dResult: emptyResult,
    callSessionsAllTimeDurationResult: emptyResult,
    callSessionsTotalCountResult: emptyResult,
    clonesResult: emptyResult,
    nextSubscriptionDueForPayment: null,
    profilesRecentResult: emptyResult,
    profilesTotalCountResult: emptyResult,
    reportDate: REPORT_DATE,
    subscriptionsMrr: null,
    usageEvents14dResult: emptyResult,
    version: 4,
  };
}

function request(query = '', authorization?: string) {
  return new NextRequest(`http://localhost/api/daily-stats${query}`, {
    headers: authorization ? { authorization } : undefined,
  });
}

function expectFreshQueries() {
  expect(mocks.from).toHaveBeenCalledWith('audio_files');
  expect(mocks.queries.getAudioFilesInRange).toHaveBeenCalledOnce();
  expect(mocks.queries.getAllCreditTransactions).toHaveBeenCalledOnce();
  for (const query of Object.values(mocks.redis)) {
    expect(query).toHaveBeenCalledOnce();
  }
}

function expectNoCacheAccess() {
  expect(mocks.existsSync).not.toHaveBeenCalled();
  expect(mocks.readFileSync).not.toHaveBeenCalled();
  expect(mocks.writeFileSync).not.toHaveBeenCalled();
}

describe('GET /api/daily-stats cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    vi.stubEnv('TELEGRAM_WEBHOOK_URL', WEBHOOK);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${REPORT_DATE}T12:00:00Z`));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fetch.mockReset().mockRejectedValue(new Error('Unexpected fetch'));
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.existsSync.mockReturnValue(false);
    mocks.readFileSync.mockReturnValue('{malformed cache');
    mocks.from.mockImplementation(() => {
      // Supabase builders support both fluent filters and Promise resolution.
      return Object.assign(
        Promise.resolve({ count: 0, data: [], error: null }),
        {
          gte: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          notIn: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
        },
      );
    });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    expect(mocks.getContributionData).not.toHaveBeenCalled();
    expect(mocks.getUserIdByStripeCustomerId).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'cache=off skips reads and writes when cache exists=%s',
    async (exists) => {
      mocks.existsSync.mockReturnValue(exists);

      const response = await GET(request('?cache=off'));
      assert(response);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Daily-Stats-Cache')).toBe('bypass');
      expectNoCacheAccess();
      expectFreshQueries();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.captureCheckIn).not.toHaveBeenCalled();
    },
  );

  it.each(['', '?cache=on', '?cache=OFF'])(
    'reads a valid cache without rewriting it for query "%s"',
    async (query) => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify(validCache()));

      const response = await GET(request(query));
      assert(response);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.get('Cache-Control')).toBeNull();
      expect(response.headers.get('X-Daily-Stats-Cache')).toBeNull();
      expect(mocks.existsSync).toHaveBeenCalledWith(CACHE_FILE);
      expect(mocks.readFileSync).toHaveBeenCalledExactlyOnceWith(
        CACHE_FILE,
        'utf-8',
      );
      expect(mocks.writeFileSync).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
      // Internal-user lookup still runs even when report data is cached.
      expect(mocks.queries.getInternalUserIds).toHaveBeenCalledOnce();
      for (const [name, queryMock] of Object.entries(mocks.queries)) {
        if (name !== 'getInternalUserIds') {
          expect(queryMock).not.toHaveBeenCalled();
        }
      }
      for (const queryMock of Object.values(mocks.redis)) {
        expect(queryMock).not.toHaveBeenCalled();
      }
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it('writes fresh results when the default cache is missing', async () => {
    const response = await GET(request());
    assert(response);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('X-Daily-Stats-Cache')).toBeNull();
    expect(mocks.existsSync).toHaveBeenCalledWith(CACHE_FILE);
    expect(mocks.readFileSync).not.toHaveBeenCalled();
    expectFreshQueries();
    expect(mocks.writeFileSync).toHaveBeenCalledExactlyOnceWith(
      CACHE_FILE,
      expect.any(String),
    );
    const cached = JSON.parse(mocks.writeFileSync.mock.calls[0][1]);
    expect(cached).toMatchObject({
      allCreditTransactions: [],
      audio14dResult: { count: 0 },
      audioYesterdayResult: { data: [], error: null },
      reportDate: REPORT_DATE,
      usageEvents14dResult: { data: [], error: null },
      version: 4,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  describe('production authentication', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      mocks.existsSync.mockReturnValue(true);
    });

    it.each([
      ['', undefined],
      ['', 'Bearer wrong-secret'],
      ['?cache=off', undefined],
      ['?cache=off', 'Bearer wrong-secret'],
    ])('rejects query "%s" with authorization %s', async (query, auth) => {
      const response = await GET(request(query, auth));
      assert(response);

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
      expect(response.headers.get('X-Daily-Stats-Cache')).toBeNull();
      expectNoCacheAccess();
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      for (const queryMock of Object.values(mocks.queries)) {
        expect(queryMock).not.toHaveBeenCalled();
      }
      for (const queryMock of Object.values(mocks.redis)) {
        expect(queryMock).not.toHaveBeenCalled();
      }
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.captureCheckIn).not.toHaveBeenCalled();
    });

    it.each(['', '?cache=off'])(
      'accepts the cron secret and ignores disk cache for query "%s"',
      async (query) => {
        mocks.fetch.mockResolvedValueOnce(new Response('{}'));

        const response = await GET(request(query, 'Bearer test-cron-secret'));
        assert(response);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(response.headers.get('Cache-Control')).toBeNull();
        expect(response.headers.get('X-Daily-Stats-Cache')).toBeNull();
        expectNoCacheAccess();
        expectFreshQueries();
        expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(
          WEBHOOK,
          expect.objectContaining({
            body: expect.stringContaining(
              'No audio files generated yesterday!',
            ),
            method: 'POST',
          }),
        );
        expect(mocks.captureCheckIn).toHaveBeenCalledTimes(2);
        expect(mocks.captureCheckIn).toHaveBeenNthCalledWith(1, {
          monitorSlug: 'telegram-bot-daily-stats',
          status: 'in_progress',
        });
        expect(mocks.captureCheckIn).toHaveBeenNthCalledWith(2, {
          checkInId: 'test-check-in',
          monitorSlug: 'telegram-bot-daily-stats',
          status: 'ok',
        });
      },
    );
  });
});
