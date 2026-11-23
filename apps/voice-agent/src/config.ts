import { dispatchSchema } from '@sexyvoice/voice-chat';

export function parseJob(
  metadata: string,
  env: NodeJS.ProcessEnv,
  now = Date.now(),
) {
  if (
    env.VOICE_CHAT_WORKER_ENABLED !== 'true' ||
    env.VERCEL_ENV === 'production'
  ) {
    throw new Error('Voice chat worker is disabled');
  }
  const job = dispatchSchema.parse(JSON.parse(metadata));
  if (job.expiresAt <= now || job.expiresAt > now + 120_000) {
    throw new Error('Invalid dispatch lifetime');
  }
  if (
    !env.VOICE_CHAT_USER_IDS?.split(',')
      .map((id) => id.trim())
      .includes(job.userId)
  ) {
    throw new Error('Test user is not allowed');
  }
  return job;
}
