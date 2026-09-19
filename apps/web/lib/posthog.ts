import { PostHog } from 'posthog-node';

export default function PostHogClient() {
  const posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    flushAt: 1,
    flushInterval: 0,
    host: 'https://eu.i.posthog.com',
  });
  return posthogClient;
}
