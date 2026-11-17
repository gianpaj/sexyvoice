import { dispatchSchema } from '@sexyvoice/voice-spike';

export function parseJob(
  metadata: string,
  env: NodeJS.ProcessEnv,
  now = Date.now(),
) {
  if (env.VOICE_SPIKE_ENABLED !== 'true' || env.VERCEL_ENV === 'production') {
    throw new Error('JS spike is disabled');
  }
  const job = dispatchSchema.parse(JSON.parse(metadata));
  if (job.expiresAt <= now || job.expiresAt > now + 120_000) {
    throw new Error('Invalid dispatch lifetime');
  }
  if (
    !env.VOICE_SPIKE_USER_IDS?.split(',')
      .map((id) => id.trim())
      .includes(job.userId)
  ) {
    throw new Error('Test user is not allowed');
  }
  return job;
}
