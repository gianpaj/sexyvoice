import type { ProviderUnavailableDetails } from '@/lib/provider-errors';
import { isProviderUnavailableDetails } from '@/lib/provider-errors';

interface ErrorCodesTranslator {
  has: (key: 'PROVIDER_UNAVAILABLE') => boolean;
  (key: 'PROVIDER_UNAVAILABLE', values: ProviderUnavailableDetails): string;
}

export function resolveErrorMessage(
  translateErrorCode: ErrorCodesTranslator,
  errorCode: unknown,
  details: unknown,
  serverFallback: string,
): string {
  if (
    errorCode !== 'PROVIDER_UNAVAILABLE' ||
    !isProviderUnavailableDetails(details) ||
    !translateErrorCode.has(errorCode)
  ) {
    return serverFallback;
  }

  return translateErrorCode(errorCode, details);
}
