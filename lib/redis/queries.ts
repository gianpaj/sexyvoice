import { Redis } from '@upstash/redis';

// Initialize Redis
const redis = Redis.fromEnv();

export interface CustomerData {
  // Stripe subscription
  status:
    | 'none' // extra
    | 'active'
    | 'canceled'
    | 'incomplete'
    | 'incomplete_expired'
    | 'past_due'
    | 'paused'
    | 'trialing'
    | 'unpaid';
}

export function setCustomerData(customerId: string, data: CustomerData) {
  return redis.set(`stripe:customer:${customerId}`, data);
}

export function getCustomerData(
  customerId: string,
): Promise<CustomerData | null> {
  return redis.get(`stripe:customer:${customerId}`);
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
