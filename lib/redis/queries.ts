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
  const keys = await redis.keys('stripe:customer:*');

  if (keys.length === 0) {
    return 0;
  }

  const customerDataList = await redis.mget<CustomerData[]>(...keys);

  return customerDataList.filter(
    (data) => data !== null && data.status === 'active',
  ).length;
}
