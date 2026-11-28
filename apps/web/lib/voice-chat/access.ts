export function isVoiceChatAllowed(
  userId: string,
  allowedIds: string | undefined,
  vercelEnv: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  const environment = vercelEnv ?? nodeEnv;
  if (environment !== 'preview' && environment !== 'development') return false;
  return Boolean(
    allowedIds
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(userId),
  );
}

export function isLocalVoiceChatEnvironment() {
  return (
    process.env.NODE_ENV === 'development' &&
    (process.env.VERCEL_ENV ?? 'development') === 'development'
  );
}

export function canUseCallChat(userId: string) {
  return (
    isLocalVoiceChatEnvironment() &&
    isVoiceChatAllowed(
      userId,
      process.env.VOICE_CHAT_USER_IDS,
      process.env.VERCEL_ENV,
      process.env.NODE_ENV,
    )
  );
}

export function isVoiceChatRequestOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  if (origin === new URL(request.url).origin) return true;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return Boolean(
    process.env.NODE_ENV === 'development' &&
      siteUrl &&
      origin === URL.parse(siteUrl)?.origin,
  );
}
