import { randomUUID } from 'node:crypto';
import { captureException } from '@sentry/nextjs';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const ACQUIRE_OPERATION = `
  if redis.call('EXISTS', KEYS[2]) == 1 then
    return -1
  end
  if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EXAT', ARGV[2]) then
    return 1
  end
  return 0
`;

const COMMIT_DELETION = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[2], ARGV[1])
  return 1
`;

const RELEASE_OPERATION = `
  if redis.call('GET', KEYS[2]) == ARGV[1] then
    redis.call('DEL', KEYS[2])
  end
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

const RESTORE_BILLING = `
  if redis.call('EXISTS', KEYS[1]) == 1 then return -1 end
  return redis.call('DEL', KEYS[2])
`;

export type AccountBillingErrorCode =
  | 'accountBillingBlocked'
  | 'accountBillingBusy';

export class AccountBillingError extends Error {
  readonly code: AccountBillingErrorCode;

  constructor(code: AccountBillingErrorCode) {
    super(code);
    this.name = 'AccountBillingError';
    this.code = code;
  }
}

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
  ]);

  if (acquired === -1) throw new AccountBillingError('accountBillingBlocked');
  if (acquired === 0) throw new AccountBillingError('accountBillingBusy');
  if (acquired !== 1)
    throw new Error('Failed to acquire account billing reservation');

  return { checkoutExpiresAt, token, userId };
}

type BillingOperation = Awaited<
  ReturnType<typeof acquireAccountBillingOperation>
>;

export async function commitAccountDeletion(operation: BillingOperation) {
  // Cleanup must stay protected even if it outlives the reservation lease.
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

// Support-only recovery for interrupted requests, after confirming cleanup stopped.
// Follow scripts/README.md#restore-account-billing; never call on sign-in.
export async function restoreAccountBilling(userId: string): Promise<boolean> {
  const restored = await redis.eval(RESTORE_BILLING, billingKeys(userId), []);
  if (restored === -1) throw new AccountBillingError('accountBillingBusy');
  if (restored !== 0 && restored !== 1)
    throw new Error('Failed to restore account billing');
  return restored === 1;
}
