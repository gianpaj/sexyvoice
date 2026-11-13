import { isProviderUnavailableDetails } from '@/lib/provider-errors';

type TranslationValues = Record<string, string>;

type LocalizedErrorCode = 'GEMINI_OUTPUT_LIMIT' | 'PROVIDER_UNAVAILABLE';

export interface ErrorCodesTranslator {
  has: (key: LocalizedErrorCode) => boolean;
  (key: LocalizedErrorCode, values?: TranslationValues): string;
}

export function resolveErrorMessage(
  translateErrorCode: ErrorCodesTranslator,
  errorCode: unknown,
  details: unknown,
  serverFallback: string,
): string {
  if (
    errorCode === 'GEMINI_OUTPUT_LIMIT' &&
    translateErrorCode.has(errorCode)
  ) {
    return translateErrorCode(errorCode);
  }
  if (
    errorCode !== 'PROVIDER_UNAVAILABLE' ||
    !isProviderUnavailableDetails(details) ||
    !translateErrorCode.has(errorCode)
  ) {
    return serverFallback;
  }

  return translateErrorCode(errorCode, { provider: details.provider });
}
