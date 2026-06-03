'use server';

import type { Locale } from '@/lib/i18n/i18n-config';
import { i18n } from '@/lib/i18n/i18n-config';
import { upsertNotificationEmailPreferences } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

export async function updateProfilePreferencesAction(params: {
  firstGenerationEmail: boolean;
  locale: Locale;
  welcomeEmail: boolean;
}) {
  if (!i18n.locales.includes(params.locale)) {
    throw new Error('Invalid locale');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not found');
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ locale: params.locale })
    .eq('id', user.id);

  if (profileError) {
    throw profileError;
  }

  await upsertNotificationEmailPreferences({
    userId: user.id,
    preferences: {
      welcome_email: params.welcomeEmail,
      first_generation_email: params.firstGenerationEmail,
    },
  });

  return { locale: params.locale };
}
