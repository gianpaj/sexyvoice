import type { Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { ApiKeys } from './api-keys';

export default async function ApiKeysPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  await props.params;

  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);
  const isPaidUser = claims?.sub ? await hasUserPaid(claims.sub) : false;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <ApiKeys isPaidUser={isPaidUser} />
    </div>
  );
}
