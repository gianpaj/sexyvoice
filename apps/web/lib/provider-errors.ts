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
