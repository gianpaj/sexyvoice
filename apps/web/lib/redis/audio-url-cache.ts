import { captureException } from '@sentry/nextjs';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const EVICT_BATCH_SIZE = 100;

/**
 * Evicts dashboard TTS and clone URL cache entries. Each key is the
 * main-bucket R2 key stored in `audio_files.storage_key`.
 *
 * Keys are shared across users, so another user's identical request becomes a
 * cache miss and generates fresh audio. The database stays authoritative: a
 * Redis failure is reported as a warning and never thrown.
 */
export async function evictAudioUrlCache(
  storageKeys: Iterable<string>,
  user: { email?: string; id: string },
) {
  const keys = [...new Set(storageKeys)];

  for (let index = 0; index < keys.length; index += EVICT_BATCH_SIZE) {
    const batch = keys.slice(index, index + EVICT_BATCH_SIZE);
    try {
      await redis.del(...batch);
    } catch (cacheError) {
      captureException(cacheError, {
        extra: { storageKeys: batch },
        level: 'warning',
        user,
      });
    }
  }
}
