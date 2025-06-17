import { Redis } from '@upstash/redis';

// Initialize Redis
const redis = Redis.fromEnv();

export function setCustomerData(customerId: string, data: any) {
  return redis.set(`stripe:customer:${customerId}`, data);
}

export function getCustomerData(customerId: string): Promise<any> {
  return redis.get(`stripe:customer:${customerId}`);
}
