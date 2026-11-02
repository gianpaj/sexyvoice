import { isDisposableEmail as isNpmDisposableEmail } from 'disposable-email-domains-js';

import denyDomainsList from './deny-domains.json';

// Bundled amieiro/disposable-email-domains list (regenerate with
// `pnpm sync-deny-domains`). Built into a Set once per cold start.
const denyDomains: ReadonlySet<string> = new Set(denyDomainsList);

/** Extract the lowercased domain from an email, or null if it isn't one. */
function getEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at === -1 || at === email.length - 1) {
    return null;
  }
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

/**
 * Returns true if the email belongs to a disposable / temporary provider.
 *
 * Checks two sources: the `disposable-email-domains-js` package and the much
 * larger amieiro/disposable-email-domains list bundled in ./deny-domains.json
 * (regenerate with `pnpm sync-deny-domains`).
 */
export function isDisposableEmail(email: string): boolean {
  if (isNpmDisposableEmail(email)) {
    return true;
  }
  const domain = getEmailDomain(email);
  return domain !== null && denyDomains.has(domain);
}
