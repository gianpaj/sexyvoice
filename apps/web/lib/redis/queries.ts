import { Redis } from '@upstash/redis';
import type { Redis as IORedis } from 'ioredis';
import type Stripe from 'stripe';

import { getSubscriptionMrrByPriceId } from '../stripe/pricing';

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
  /** Sum of full monthly recurring dollar amounts across active subscriptions. */
  mrr: number;
  /** Active subscriptions whose priceId has no known recurring amount. */
  mrrUnknownCount: number;
  nextDueSubscription: {
    customerId: string;
    data: CustomerData;
    dueDate: string;
  } | null;
}

interface SubscriptionScanAccumulator extends SubscriptionScanResult {
  /** Soonest future renewal time seen so far, in epoch seconds. */
  closestDueTime: number;
}

/**
 * Folds a single `stripe:customer:*` record into the running scan totals:
 * active count, MRR (sum of full monthly recurring amounts), and the next
 * renewal due. No-op for missing or non-active subscriptions.
 */
function accumulateSubscription(
  acc: SubscriptionScanAccumulator,
  key: string,
  data: CustomerData | null,
  now: number,
  mrrByPriceId: Map<string, number>,
): void {
  if (data === null || data.status !== 'active') return;

  acc.activeCount++;

  const monthlyAmount = data.priceId
    ? mrrByPriceId.get(data.priceId)
    : undefined;
  if (monthlyAmount === undefined) {
    acc.mrrUnknownCount++;
  } else {
    acc.mrr += monthlyAmount;
  }

  if (
    data.currentPeriodEnd &&
    data.currentPeriodEnd > now &&
    data.currentPeriodEnd < acc.closestDueTime
  ) {
    acc.closestDueTime = data.currentPeriodEnd;
    acc.nextDueSubscription = {
      customerId: key.replace('stripe:customer:', ''),
      data,
      dueDate: new Date(data.currentPeriodEnd * 1000).toISOString(),
    };
  }
}

/**
 * Single SCAN pass over all `stripe:customer:*` keys that simultaneously
 * counts active subscriptions, sums their MRR, and finds the next renewal date.
 * Calling `countActiveCustomerSubscriptions`, `getActiveSubscriptionsMrr` and
 * `findNextSubscriptionDueForPayment` separately used to do full scans each
 * (hundreds of round-trips each). This shared helper collapses them into one.
 */
async function scanSubscriptions(): Promise<SubscriptionScanResult> {
  let cursor: string | number = 0;
  const now = Date.now() / 1000; // seconds
  const mrrByPriceId = getSubscriptionMrrByPriceId();
  const acc: SubscriptionScanAccumulator = {
    activeCount: 0,
    mrr: 0,
    mrrUnknownCount: 0,
    nextDueSubscription: null,
    closestDueTime: Number.POSITIVE_INFINITY,
  };

  do {
    const [nextCursor, keys]: [string, string[]] = await redis.scan(cursor, {
      match: 'stripe:customer:*',
      count: 500, // hint: return ~500 keys per iteration instead of the default ~10
    });
    cursor = nextCursor;

    if (keys.length > 0) {
      const customerDataList = await redis.mget<CustomerData[]>(...keys);

      for (let i = 0; i < customerDataList.length; i++) {
        accumulateSubscription(
          acc,
          keys[i],
          customerDataList[i],
          now,
          mrrByPriceId,
        );
      }
    }
  } while (cursor !== '0');

  return {
    activeCount: acc.activeCount,
    mrr: acc.mrr,
    mrrUnknownCount: acc.mrrUnknownCount,
    nextDueSubscription: acc.nextDueSubscription,
  };
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

export async function getActiveSubscriptionsMrr(): Promise<{
  mrr: number;
  unknownCount: number;
}> {
  const { mrr, mrrUnknownCount } = await getSharedScanResult();
  return { mrr, unknownCount: mrrUnknownCount };
}
