import type { useTranslations } from 'next-intl';

import type {
  CloneErrorResponseBody,
  CloneRouteErrorCode,
  RouteErrorDetails,
} from '@/lib/clone/api-types';
import { resolveErrorMessage } from '@/lib/errors/resolve-error-message';

type CloneTranslator = ReturnType<typeof useTranslations<'clone'>>;
type ErrorCodesTranslator = ReturnType<typeof useTranslations<'errorCodes'>>;

// The server returns `CloneErrorResponseBody`, but proxies and older responses
// may omit fields, so every field is treated as optional here. `message` is not
// part of the route contract but can arrive from upstream/proxy error bodies.
type CloneErrorResponse = Partial<CloneErrorResponseBody> & {
  message?: string;
};

const getCloneErrorMessage = (
  t: CloneTranslator,
  translateErrorCode: ErrorCodesTranslator,
  code?: CloneRouteErrorCode,
  fallbackMessage?: string,
  details?: RouteErrorDetails,
): string => {
  const serverFallback = fallbackMessage || t('errorCloning');
  if (code === 'PROVIDER_UNAVAILABLE') {
    return resolveErrorMessage(
      translateErrorCode,
      code,
      details,
      serverFallback,
    );
  }

  if (!code) {
    return serverFallback;
  }

  const messageKey = code as Parameters<CloneTranslator>[0];
  if (!t.has(messageKey)) {
    return serverFallback;
  }

  // Route details fill the message's ICU arguments, such as {MIN} or {MAX}.
  const values = Object.fromEntries(
    Object.entries(details ?? {}).filter(
      (entry): entry is [string, number | string] =>
        typeof entry[1] === 'number' || typeof entry[1] === 'string',
    ),
  );
  return t(messageKey, values);
};

/** Localized message for a failed `POST /api/clone-voice` response. */
export async function readCloneError(
  response: Response,
  t: CloneTranslator,
  translateErrorCode: ErrorCodesTranslator,
): Promise<string> {
  let body: CloneErrorResponse | null = null;
  try {
    body = (await response.json()) as CloneErrorResponse;
  } catch {
    body = null;
  }

  // Older/proxy 413 responses may still arrive without the JSON error contract.
  if (response.status === 413 && !body?.code) {
    return t('errorTooLarge');
  }
  return getCloneErrorMessage(
    t,
    translateErrorCode,
    body?.code,
    body?.message || body?.serverMessage || body?.error || t('errorCloning'),
    body?.details,
  );
}
