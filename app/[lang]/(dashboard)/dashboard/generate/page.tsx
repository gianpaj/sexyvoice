import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
// import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from '@/lib/i18n/i18n-config';
import { GenerateUI } from './generateui.client';

export default async function GeneratePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  // const params = await props.params;
  // const { lang } = params;
  // const dict = await getDictionary(lang);

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user || error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's voices
  // const { data: userVoices } = await supabase
  //   .from('voices')
  //   .select('*')
  //   .eq('user_id', user?.id);

  // Get public voices
  // const { data: publicVoices } = await supabase
  //   .from('voices')
  //   .select('*')
  //   .eq('is_public', true)
  //   .neq('user_id', user?.id);

  // Get user's credits
  const { data: credits } = await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', user.id)
    .single();

  const { data: credit_transactions } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const plan = credit_transactions?.findLast((t) => t.type === 'freemium')
    ? 'free'
    : 'paid';

  return (
    <div className="space-y-8">
      {credits && (
        <div className="rounded-lg bg-blue-500 p-6 text-white">
          <div className="flex items-center justify-between mb-4 w-50">
            <div className="flex items-center">
              <span className="text-xl font-medium">
                You are currently on the {plan} offer
              </span>
            </div>
            {/* <Button className="bg-white text-blue-500 hover:bg-white/90">
              Add credits
            </Button> */}
          </div>
          <div className="w-full bg-blue-400/40 rounded-full h-2 mb-2">
            <div
              className="bg-white h-2 rounded-full"
              style={{ width: `${(4 / credits?.amount) * 100}%` }}
            />
          </div>
          <div className="flex justify-between">
            <span>{credits?.amount.toLocaleString()} credits spent</span>
            <span>{credits?.amount.toLocaleString()} credits remaining</span>
          </div>
        </div>
      )}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Generate Audio</h2>
        <p className="text-muted-foreground">
          Select a voice and generate audio from text
        </p>
      </div>

      <div className="grid gap-6">
        <GenerateUI credits={credits} />
      </div>
    </div>
  );
}
