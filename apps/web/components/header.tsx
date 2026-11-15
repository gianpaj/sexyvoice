import { HeaderStatic } from '@/components/header-static';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

/** The public header, linking a signed-in visitor to the dashboard. */
export async function Header() {
  const claims = await getVerifiedClaims(await createClient());
  return <HeaderStatic signedIn={Boolean(claims?.sub)} />;
}
