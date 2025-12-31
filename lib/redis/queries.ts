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
  // Stripe subscription
  status: Stripe.Subscription.Status | 'none'; // extra;
  subscriptionId?: string;
  priceId?: string;
  currentPeriodEnd?: number;
  currentPeriodStart?: number;
  /**
   * Whether this subscription will (if status=active) or did (if status=canceled) cancel at the end of the current billing period.
   */
  cancelAtPeriodEnd?: boolean | null;
  paymentMethod?: {
    /**
     * Card brand. Can be amex, diners, discover, eftpos_au, jcb, link, mastercard, unionpay, visa, or unknown.
     */
    brand: string | null;
    last4: string | null;
  } | null;
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

export async function countActiveCustomerSubscriptions() {
  let cursor: string | number = 0;
  let activeCount = 0;
  do {
    const [nextCursor, keys]: [string, string[]] = await redis.scan(cursor, {
      match: 'stripe:customer:*',
    });

    cursor = nextCursor;
    if (keys.length > 0) {
      const customerDataList = await redis.mget<CustomerData[]>(...keys);
      activeCount += customerDataList.filter(
        (data) => data !== null && data.status === 'active',
      ).length;
    }
  } while (cursor !== '0');
  return activeCount;
}
export async function findNextSubscriptionDueForPayment() {
  let cursor: string | number = 0;
  let nextDueSubscription: {
    customerId: string;
    data: CustomerData;
    dueDate: string;
  } | null = null;
  let closestDueTime = Number.POSITIVE_INFINITY;
  const now = new Date('2025-12-02').getTime() / 1000; // Current time in seconds
  // const now = Date.now() / 1000; // Current time in seconds

  do {
    const [nextCursor, keys]: [string, string[]] = await redis.scan(cursor, {
      match: 'stripe:customer:*',
    });

    cursor = nextCursor;
    if (keys.length > 0) {
      const customerDataList = await redis.mget<CustomerData[]>(...keys);

      for (let i = 0; i < customerDataList.length; i++) {
        const data = customerDataList[i];
        // Find active subscriptions with a future renewal date
        // that is closer than any we've seen so far
        if (
          data !== null &&
          data.status === 'active' &&
          data.currentPeriodEnd &&
          data.currentPeriodEnd > now && // Hasn't expired yet
          data.currentPeriodEnd < closestDueTime // Closer than previous best
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

  return nextDueSubscription;
}
