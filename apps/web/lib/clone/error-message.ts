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

/** Fills `__KEY__` placeholders in clone copy. */
export const formatCloneMessage = (
  message: string,
  values: Record<string, boolean | number | string | null | undefined>,
) =>
  Object.entries(values).reduce(
    (formatted, [key, value]) =>
      value === null || value === undefined
        ? formatted
        : formatted.replaceAll(`__${key}__`, String(value)),
    message,
  );

export const getCloneErrorMessage = (
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

  const message = t(messageKey);
  return formatCloneMessage(message, details ?? {});
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
