import 'server-only';

import type { ProviderId } from '@/lib/provider-errors';
import { getProviderUnavailableDetails } from '@/lib/provider-errors';

export const PROVIDER_UNAVAILABLE_TEMPLATE =
  '{provider} is temporarily unavailable. Please retry.';

export function getProviderUnavailableMessage(provider: ProviderId): string {
  const { provider: displayName } = getProviderUnavailableDetails(provider);

  return PROVIDER_UNAVAILABLE_TEMPLATE.replace('{provider}', displayName);
}
