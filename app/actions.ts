'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { encodedRedirect } from '@/lib/utils';

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get('email')?.toString();
  const lang = formData.get('lang')?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get('origin');
  const callbackUrl = formData.get('callbackUrl')?.toString();

  if (!email) {
    return encodedRedirect(
      'error',
      `/${lang}/reset-password`,
      'email_required',
    );
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/${lang}/protected/update-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect('error', `/${lang}/reset-password`, 'generic_error');
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect('success', `/${lang}/reset-password`, '');
};

export const updatePasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const lang = formData.get('lang')?.toString();

  if (!password || !confirmPassword) {
    encodedRedirect(
      'error',
      `/${lang}/protected/update-password`,
      'passwords_required',
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect(
      'error',
      `/${lang}/protected/update-password`,
      'passwords_do_not_match',
    );
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    console.error(error);
    let message = 'Password update failed';
    if (error.code === 'same_password') {
      message = 'same_password';
    }
    encodedRedirect('error', `/${lang}/protected/update-password`, message);
  }

  encodedRedirect('success', `/${lang}/dashboard`, 'passwords_updated');
};
