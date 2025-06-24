import { Redis } from '@upstash/redis';

// Initialize Redis
const redis = Redis.fromEnv();

interface CustomerData {
  // Stripe subscription
  status:
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
