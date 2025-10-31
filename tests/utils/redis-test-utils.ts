import { Redis } from 'ioredis';
import { RedisMemoryServer } from 'redis-memory-server';

let redisServer: RedisMemoryServer | null = null;
let redisClient: Redis | null = null;

/**
 * Starts an in-memory Redis server for testing
 * @returns Redis client instance connected to the test server
 */
export async function setupRedis(): Promise<Redis> {
  redisServer = new RedisMemoryServer();
  const host = await redisServer.getHost();
  const port = await redisServer.getPort();

  redisClient = new Redis({
    host,
    port,
  });

  return redisClient;
}

/**
 * Cleans up the Redis server and client
 */
export async function teardownRedis(): Promise<void> {
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
  if (redisServer) {
    await redisServer.stop();
    redisServer = null;
  }
}

/**
 * Clears all keys from the test Redis instance
 */
export async function clearRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.flushall();
  }
}

/**
 * Gets the current test Redis client instance
 */
export function getTestRedisClient(): Redis | null {
  return redisClient;
}
