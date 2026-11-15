import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const AMIEIRO_REPO =
  'https://github.com/amieiro/disposable-email-domains';

/**
 * The amieiro deny list that the web app's signup route checks. The
 * sync-deny-domains command writes it from a fresh clone.
 */
export const DENY_DOMAINS_FILE = fileURLToPath(
  new URL(
    '../../apps/web/lib/disposable-email/deny-domains.json',
    import.meta.url,
  ),
);

export function readDenyDomains(): Set<string> {
  return new Set(JSON.parse(readFileSync(DENY_DOMAINS_FILE, 'utf8')));
}
