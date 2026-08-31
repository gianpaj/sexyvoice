import 'server-only';

import type { ProviderId } from '@/lib/provider-errors';
import { getProviderUnavailableDetails } from '@/lib/provider-errors';
import messages from '@/messages/en.json';

const PROVIDER_UNAVAILABLE_TEMPLATE = messages.errorCodes.PROVIDER_UNAVAILABLE;

export function getProviderUnavailableMessage(provider: ProviderId): string {
  const { provider: displayName } = getProviderUnavailableDetails(provider);

  return PROVIDER_UNAVAILABLE_TEMPLATE.replace('{provider}', displayName);
}
