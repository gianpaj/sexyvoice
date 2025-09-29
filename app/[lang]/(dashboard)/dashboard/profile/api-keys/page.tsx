import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ApiKeysClient } from './api-keys.client';
import { getDictionary } from '@/lib/i18n/get-dictionary';

export default async function ApiKeysPage({
  params,
}: {
  params: { lang: string };
}) {
  const supabase = await createClient();
  
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    redirect('/login');
  }

  const dict = await getDictionary(params.lang);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {dict.apiKeys?.title || 'API Keys'}
        </h1>
        <p className="mt-2 text-gray-600">
          {dict.apiKeys?.description || 'Manage your API keys for external access to SexyVoice.ai'}
        </p>
      </div>
      
      <Suspense fallback={<div>Loading...</div>}>
        <ApiKeysClient dict={dict.apiKeys} />
      </Suspense>
    </div>
  );
}