import { Redis } from 'ioredis';
import { RedisMemoryServer } from 'redis-memory-server';

let redisServer: RedisMemoryServer | null = null;
let redisClient: Redis | null = null;

/**
 * Starts an in-memory Redis server for testing
 * @returns Redis client instance connected to the test server
 */
export async function setupRedis(): Promise<Redis> {
  // Configure redis-memory-server with explicit DOWNLOAD_DIR for pnpm compatibility
   // This is the recommended workaround for pnpm's nested node_modules structure
   const downloadDir = process.env.REDISMS_DOWNLOAD_DIR ||
                       process.env.HOME + '/.cache/redis-binaries';


  // Configure redis-memory-server with explicit settings for faster CI downloads
  const config: any = {
    instance: {
      port: undefined, // auto-assign available port
    },
    binary: {
      version: '7.2.4', // Use a specific stable version
      downloadDir, // Explicit path for pnpm compatibility
    },
  };

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
