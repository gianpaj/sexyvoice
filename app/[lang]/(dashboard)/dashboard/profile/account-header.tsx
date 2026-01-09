'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function AccountHeader({
  dict,
  lang,
}: {
  dict: (typeof langDict)['profile'];
  lang: Locale;
}) {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push(`/${lang}`);
  };

  return (
    <div className="flex items-center justify-between">
      <h1 className="font-semibold text-xl">{dict.title}</h1>
      <Button onClick={handleSignOut} variant="outline">
        {dict.logOut}
      </Button>
    </div>
  );
}
