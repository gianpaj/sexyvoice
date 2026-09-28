import { randomUUID } from 'node:crypto';
import { captureException } from '@sentry/nextjs';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const ACQUIRE_OPERATION = `
  if ARGV[3] == 'checkout' and redis.call('EXISTS', KEYS[2]) == 1 then
    return 0
  end
  if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EXAT', ARGV[2]) then
    return 1
  end
  return 0
`;

const COMMIT_DELETION = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[2], '1')
  return 1
`;

const RELEASE_OPERATION = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

function billingKeys(userId: string) {
  return [
    `stripe:account:{${userId}}:operation`,
    `stripe:account:{${userId}}:deleted`,
  ];
}

export async function acquireAccountBillingOperation(
  userId: string,
  operation: 'checkout' | 'deletion',
) {
  const token: string = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const checkoutExpiresAt = now + 3600;
  // A timed-out Checkout request must expire before its reservation does.
  const lockExpiresAt =
    operation === 'checkout' ? checkoutExpiresAt + 60 : now + 300;
  const acquired = await redis.eval(ACQUIRE_OPERATION, billingKeys(userId), [
    token,
    lockExpiresAt,
    operation,
  ]);

  if (acquired !== 1) {
    throw new Error('Account billing is busy or account deletion has started');
  }

  return { checkoutExpiresAt, token, userId };
}

type BillingOperation = Awaited<
  ReturnType<typeof acquireAccountBillingOperation>
>;

export async function commitAccountDeletion(operation: BillingOperation) {
  const committed = await redis.eval(
    COMMIT_DELETION,
    billingKeys(operation.userId),
    [operation.token],
  );
  if (committed !== 1) {
    throw new Error('Account deletion lost its billing reservation');
  }
}

export async function releaseAccountBillingOperation(
  operation: BillingOperation,
) {
  try {
    await redis.eval(RELEASE_OPERATION, billingKeys(operation.userId), [
      operation.token,
    ]);
  } catch (error) {
    captureException(error, {
      extra: { context: 'release account billing reservation' },
      user: { id: operation.userId },
    });
  }
}
