'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function AccountHeader() {
  const t = useTranslations('profile');
  const locale = useLocale();
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push(`/${locale}`);
  };

  return (
    <div className="flex items-center justify-between">
      <h1 className="font-semibold text-xl">{t('title')}</h1>
      <Button onClick={handleSignOut} variant="outline">
        {t('logOut')}
      </Button>
    </div>
  );
}
