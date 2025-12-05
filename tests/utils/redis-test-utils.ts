import { Redis } from 'ioredis';
import { RedisMemoryServer } from 'redis-memory-server';

let redisServer: RedisMemoryServer | null = null;
let redisClient: Redis | null = null;

/**
 * Starts a Redis connection for testing
 * In CI: connects to a regular Redis server running on localhost
 * Otherwise: starts an in-memory Redis server
 * @returns Redis client instance connected to the test server
 */
export async function setupRedis(): Promise<Redis> {
  if (process.env.CI) {
    // In CI, connect to Redis server running on localhost
    const host = process.env.REDIS_HOST || 'localhost';
    const port = Number.parseInt(process.env.REDIS_PORT || '6379', 10);

    redisClient = new Redis({
      host,
      port,
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying after 3 attempts
        }
        return Math.min(times * 50, 2000);
      },
    });

    return redisClient;
  }

  // Local development: use in-memory Redis server
  // Configure redis-memory-server with explicit settings for faster downloads
  const config: any = {
    instance: {
      port: undefined, // auto-assign available port
    },
    binary: {
      version: '7.2.4', // Use a specific stable version
    },
  };

  // Only set downloadDir if the environment variable is defined
  if (process.env.REDIS_MEMORY_SERVER_CACHE_DIR) {
    config.binary.downloadDir = process.env.REDIS_MEMORY_SERVER_CACHE_DIR;
  }

  redisServer = new RedisMemoryServer(config);

  const host = await redisServer.getHost();
  const port = await redisServer.getPort();

  redisClient = new Redis({
    host,
    port,
    retryStrategy: (times) => {
      if (times > 3) {
        return null; // Stop retrying after 3 attempts
      }
      return Math.min(times * 50, 2000);
    },
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
