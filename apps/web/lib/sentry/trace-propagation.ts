export function getBrowserTracePropagationTargets(): RegExp[] {
  // Explicit targets replace Sentry's same-origin default.
  const targets = [/^\/(?!\/)/];
  const origins = [
    typeof window === 'undefined' ? undefined : window.location.origin,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ];

  for (const origin of origins) {
    if (!origin) continue;
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      targets.push(
        new RegExp(
          `^${url.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|$)`,
        ),
      );
    } catch {
      // Invalid configuration must not broaden the cross-origin allowlist.
    }
  }
  return targets;
}
