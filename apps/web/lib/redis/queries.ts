import { Redis } from '@upstash/redis';
import type { Redis as IORedis } from 'ioredis';
import type Stripe from 'stripe';

// Initialize Redis
const redis = Redis.fromEnv();

// Allow injecting a test Redis client for testing
let testRedisClient: IORedis | null = null;

export function setTestRedisClient(client: IORedis | null) {
  testRedisClient = client;
}

function getRedisClient() {
  return testRedisClient || redis;
}

export interface CustomerData {
  /**
   * Whether this subscription will (if status=active) or did (if status=canceled) cancel at the end of the current billing period.
   */
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: number;
  currentPeriodStart?: number;
  paymentMethod?: {
    /**
     * Card brand. Can be amex, diners, discover, eftpos_au, jcb, link, mastercard, unionpay, visa, or unknown.
     */
    brand: string | null;
    last4: string | null;
  } | null;
  priceId?: string;
  // Stripe subscription
  status: Stripe.Subscription.Status | 'none'; // extra;
  subscriptionId?: string;
}

export function setCustomerData(customerId: string, data: CustomerData) {
  return getRedisClient().set(
    `stripe:customer:${customerId}`,
    JSON.stringify(data),
  );
}

export async function getCustomerData(
  customerId: string,
): Promise<CustomerData | null> {
  const result = await getRedisClient().get(`stripe:customer:${customerId}`);
  if (!result) return null;

  // Handle both string (from ioredis) and object (from upstash) responses
  if (typeof result === 'string') {
    return JSON.parse(result);
  }
  return result as CustomerData;
}

interface SubscriptionScanResult {
  activeCount: number;
  nextDueSubscription: {
    customerId: string;
    data: CustomerData;
    dueDate: string;
  } | null;
}

/**
 * Single SCAN pass over all `stripe:customer:*` keys that simultaneously
 * counts active subscriptions and finds the next renewal date.
 * Calling both `countActiveCustomerSubscriptions` and
 * `findNextSubscriptionDueForPayment` separately used to do two full scans
 * (hundreds of round-trips each). This shared helper halves that cost.
 */
async function scanSubscriptions(): Promise<SubscriptionScanResult> {
  let cursor: string | number = 0;
  let activeCount = 0;
  let nextDueSubscription: SubscriptionScanResult['nextDueSubscription'] = null;
  let closestDueTime = Number.POSITIVE_INFINITY;
  const now = Date.now() / 1000; // seconds

  do {
    const [nextCursor, keys]: [string, string[]] = await redis.scan(cursor, {
      match: 'stripe:customer:*',
      count: 500, // hint: return ~500 keys per iteration instead of the default ~10
    });
    cursor = nextCursor;

    if (keys.length > 0) {
      const customerDataList = await redis.mget<CustomerData[]>(...keys);

      for (let i = 0; i < customerDataList.length; i++) {
        const data = customerDataList[i];
        if (data === null || data.status !== 'active') continue;

        activeCount++;

        if (
          data.currentPeriodEnd &&
          data.currentPeriodEnd > now &&
          data.currentPeriodEnd < closestDueTime
        ) {
          closestDueTime = data.currentPeriodEnd;
          nextDueSubscription = {
            customerId: keys[i].replace('stripe:customer:', ''),
            data,
            dueDate: new Date(data.currentPeriodEnd * 1000).toISOString(),
          };
        }
      }
    }
  } while (cursor !== '0');

  return { activeCount, nextDueSubscription };
}

// Cache the in-flight scan promise so that concurrent callers (e.g. both
// `countActiveCustomerSubscriptions` and `findNextSubscriptionDueForPayment`
// called from the same Promise.all) share a single SCAN pass.
let _scanPromise: Promise<SubscriptionScanResult> | null = null;

function getSharedScanResult(): Promise<SubscriptionScanResult> {
  if (!_scanPromise) {
    _scanPromise = scanSubscriptions().finally(() => {
      _scanPromise = null;
    });
  }
  return _scanPromise;
}

export async function countActiveCustomerSubscriptions(): Promise<number> {
  const { activeCount } = await getSharedScanResult();
  return activeCount;
}

export async function findNextSubscriptionDueForPayment(): Promise<
  SubscriptionScanResult['nextDueSubscription']
> {
  const { nextDueSubscription } = await getSharedScanResult();
  return nextDueSubscription;
}
