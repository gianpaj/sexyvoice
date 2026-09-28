import type { Redis } from 'ioredis';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  acquireAccountBillingOperation,
  commitAccountDeletion,
  releaseAccountBillingOperation,
} from '@/lib/stripe/account-billing';
import {
  clearRedis,
  setupRedis,
  teardownRedis,
} from './utils/redis-test-utils';

const mocks = vi.hoisted(() => ({ eval: vi.fn() }));

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({ eval: mocks.eval }) },
}));

describe('account billing coordination', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = await setupRedis();
    mocks.eval.mockImplementation(
      (script: string, keys: string[], args: (string | number)[]) =>
        redis.eval(script, keys.length, ...keys, ...args),
    );
  });

  afterAll(teardownRedis);
  beforeEach(clearRedis);

  it('allows only one concurrent checkout or deletion for an account', async () => {
    const results = await Promise.allSettled([
      acquireAccountBillingOperation('user-1', 'checkout'),
      acquireAccountBillingOperation('user-1', 'deletion'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      acquireAccountBillingOperation('user-2', 'checkout'),
    ).resolves.toBeDefined();
  });

  it('lets deletion check sessions after checkout creation finishes', async () => {
    const checkout = await acquireAccountBillingOperation('user-1', 'checkout');
    await expect(
      acquireAccountBillingOperation('user-1', 'deletion'),
    ).rejects.toThrow();

    await releaseAccountBillingOperation(checkout);

    await expect(
      acquireAccountBillingOperation('user-1', 'deletion'),
    ).resolves.toBeDefined();
  });

  it('keeps unknown checkout outcomes reserved beyond the session expiration', async () => {
    const checkout = await acquireAccountBillingOperation('user-1', 'checkout');
    const ttl = await redis.ttl('stripe:account:{user-1}:operation');

    expect(
      checkout.checkoutExpiresAt - Math.floor(Date.now() / 1000),
    ).toBeGreaterThan(3500);
    expect(ttl).toBeGreaterThan(
      checkout.checkoutExpiresAt - Math.floor(Date.now() / 1000),
    );
  });

  it('rejects stale deletion commits after another checkout starts', async () => {
    const deletion = await acquireAccountBillingOperation('user-1', 'deletion');
    await redis.pexpire('stripe:account:{user-1}:operation', 0);
    await acquireAccountBillingOperation('user-1', 'checkout');

    await expect(commitAccountDeletion(deletion)).rejects.toThrow(
      'lost its billing reservation',
    );
    expect(await redis.exists('stripe:account:{user-1}:deleted')).toBe(0);

    await releaseAccountBillingOperation(deletion);
    await expect(
      acquireAccountBillingOperation('user-1', 'deletion'),
    ).rejects.toThrow();
  });

  it('rejects a deletion commit after its reservation expires', async () => {
    const deletion = await acquireAccountBillingOperation('user-1', 'deletion');
    await redis.pexpire('stripe:account:{user-1}:operation', 0);

    await expect(commitAccountDeletion(deletion)).rejects.toThrow(
      'lost its billing reservation',
    );
  });

  it('permanently blocks checkout after deletion commits but permits cleanup retries', async () => {
    const deletion = await acquireAccountBillingOperation('user-1', 'deletion');
    await commitAccountDeletion(deletion);
    await releaseAccountBillingOperation(deletion);

    expect(await redis.ttl('stripe:account:{user-1}:deleted')).toBe(-1);
    await expect(
      acquireAccountBillingOperation('user-1', 'checkout'),
    ).rejects.toThrow();

    const retry = await acquireAccountBillingOperation('user-1', 'deletion');
    await commitAccountDeletion(retry);
    await releaseAccountBillingOperation(retry);
    await expect(
      acquireAccountBillingOperation('user-1', 'checkout'),
    ).rejects.toThrow();
  });

  it('allows checkout after a blocked deletion releases its reservation', async () => {
    const deletion = await acquireAccountBillingOperation('user-1', 'deletion');
    await releaseAccountBillingOperation(deletion);

    await expect(
      acquireAccountBillingOperation('user-1', 'checkout'),
    ).resolves.toBeDefined();
  });

  it('fails closed if Redis cannot acquire a reservation', async () => {
    mocks.eval.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(
      acquireAccountBillingOperation('user-1', 'deletion'),
    ).rejects.toThrow('Redis unavailable');
  });
});
