import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

import { loadScriptEnv } from './lib/env.mts';

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const { values } = parseArgs({
    args,
    options: {
      'cleanup-stopped': { type: 'boolean' },
      'env-file': { multiple: true, type: 'string' },
      help: { short: 'h', type: 'boolean' },
      'user-id': { type: 'string' },
    },
  });

  if (values.help) {
    console.log(`Restore billing after an interrupted account deletion.

Usage: pnpm --filter @sexyvoice/scripts restore-account-billing --user-id <uuid> --cleanup-stopped [--env-file <path>]

Confirm from request logs that every deletion request has stopped before using
--cleanup-stopped. An expired Redis reservation is not enough.
The script refuses recovery while a billing reservation exists.`);
    return;
  }

  const userId = values['user-id'];
  if (
    !(
      userId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userId,
      )
    )
  ) {
    throw new Error('Provide the verified Supabase Auth UUID with --user-id.');
  }
  if (!values['cleanup-stopped']) {
    throw new Error(
      'Confirm all deletion requests have stopped, then pass --cleanup-stopped.',
    );
  }

  loadScriptEnv(values['env-file']);
  // Load after environment setup; tsx handles the web module's CommonJS dependencies.
  const require = createRequire(import.meta.url);
  // Keep the script's type graph independent of Next.js global declarations.
  const { restoreAccountBilling } =
    require('../apps/web/lib/stripe/account-billing.ts') as {
      restoreAccountBilling: (userId: string) => Promise<boolean>;
    };
  const restored = await restoreAccountBilling(userId);
  console.log(
    restored
      ? `Billing restored for ${userId}`
      : `No billing block found for ${userId}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
