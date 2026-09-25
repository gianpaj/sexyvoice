const PROVIDER_STATUS_PROPERTIES = [
  'status',
  'statusCode',
  'raw_status_code',
] as const;

const PROVIDER_IDS = ['gemini', 'grok', 'mistral', 'replicate'] as const;
const PROVIDER_DISPLAY_NAMES = [
  'Gemini',
  'Grok',
  'Mistral',
  'Replicate',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];
export type ProviderDisplayName = (typeof PROVIDER_DISPLAY_NAMES)[number];
export interface ProviderUnavailableDetails {
  provider: ProviderDisplayName;
}

export function isProviderId(provider: unknown): provider is ProviderId {
  return (
    typeof provider === 'string' &&
    PROVIDER_IDS.includes(provider as ProviderId)
  );
}

export function isProviderDisplayName(
  provider: unknown,
): provider is ProviderDisplayName {
  return (
    typeof provider === 'string' &&
    PROVIDER_DISPLAY_NAMES.includes(provider as ProviderDisplayName)
  );
}

export function formatProviderDisplayName(
  provider: unknown,
): ProviderDisplayName | null {
  if (!isProviderId(provider)) {
    return null;
  }

  return `${provider.charAt(0).toUpperCase()}${provider.slice(1)}` as ProviderDisplayName;
}

export function getProviderUnavailableDetails(
  provider: ProviderId,
): ProviderUnavailableDetails {
  const displayName = formatProviderDisplayName(provider);
  if (!displayName) {
    throw new TypeError(`Unsupported provider: ${String(provider)}`);
  }

  return { provider: displayName };
}

export function isProviderUnavailableDetails(
  details: unknown,
): details is ProviderUnavailableDetails {
  return (
    !!details &&
    typeof details === 'object' &&
    isProviderDisplayName((details as Record<string, unknown>).provider)
  );
}

export function getProviderErrorMessage(error: unknown): string {
  return Error.isError(error) ? error.message : String(error);
}

export function getProviderErrorName(error: unknown): string {
  return Error.isError(error) ? error.name : typeof error;
}

export function getProviderStatusCode(error: unknown): number | null {
  if (!(error && typeof error === 'object')) {
    return null;
  }

  for (const property of PROVIDER_STATUS_PROPERTIES) {
    if (property in error) {
      const value = (error as Record<string, unknown>)[property];
      if (typeof value === 'number') {
        return value;
      }
    }
  }

  return null;
}

export function isTransientProviderFailure(error: unknown): boolean {
  const statusCode = getProviderStatusCode(error);
  const message = getProviderErrorMessage(error).toLowerCase();

  return (
    (statusCode !== null && statusCode >= 500 && statusCode < 600) ||
    /status 5\d\d|bad gateway|internal server error|service unavailable|gateway timeout/.test(
      message,
    )
  );
}

/**
 * HTTP status a provider uses when it declines the *content* of a request on
 * policy grounds (as opposed to auth, quota or an outage). xAI returns 403 with
 * `{"code":"permission-denied","error":"I can't help with that request."}`.
 */
export const CONTENT_REFUSAL_STATUS_CODE = 403;

/**
 * Markers that identify a deterministic content-policy refusal in a provider's
 * error text or response body. A refusal is terminal: resubmitting the same
 * transcript can only be declined again (and billed again).
 */
export const CONTENT_REFUSAL_PATTERN =
  /permission-denied|can(?:'t|not) help with that request/i;

function getProviderResponseBody(error: unknown): string | null {
  if (error && typeof error === 'object') {
    const responseBody = (error as Record<string, unknown>).responseBody;
    if (typeof responseBody === 'string' && responseBody) {
      return responseBody;
    }
  }
  return null;
}

/**
 * True when a raw provider error *text* (the batch path only has xAI's per-
 * request message) carries a content-refusal marker. A normal error message
 * never matches.
 */
export function isContentRefusalText(text: unknown): boolean {
  return typeof text === 'string' && CONTENT_REFUSAL_PATTERN.test(text);
}

/**
 * True only for a provider content refusal: the status is 403 *and* the error
 * carries a refusal marker (preferring `responseBody` over `message`). A 403
 * without the markers (e.g. a bad API key) or a 5xx/429 with them stays
 * `false`, so a refusal never overlaps `isTransientProviderFailure`.
 */
export function isProviderContentRefusal(error: unknown): boolean {
  if (getProviderStatusCode(error) !== CONTENT_REFUSAL_STATUS_CODE) {
    return false;
  }
  const responseBody = getProviderResponseBody(error);
  const text = responseBody ?? getProviderErrorMessage(error);
  return CONTENT_REFUSAL_PATTERN.test(text);
}
