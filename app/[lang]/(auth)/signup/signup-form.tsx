'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { banList } from '@/lib/banlist';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import { LogosGoogleIcon } from '@/lib/icons';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function SignUpForm({
  dict,
  lang,
}: {
  dict: (typeof langDict)['auth']['signup'];
  lang: Locale;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Check if email is Gmail with + sign and block it
      // Block email if it's in the ban list
      if (
        (email.includes('+') && email.toLowerCase().includes('@gmail.com')) ||
        banList.includes(email)
      ) {
        setTimeout(() => {
          setError('Error creating account');
          setIsLoading(false);
        }, 5000);
        return;
      }

      const { error: signUpError, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          // data: {
          //   username,
          // },
        },
      });

      setIsLoading(false);
      if (signUpError || !data.user) {
        console.error(signUpError, data);
        // TODO: handle if user already exists. Supabase returns a fake user if the email is already registered. (https://github.com/supabase/auth/issues/1517)
        if (signUpError?.message.includes('already registered')) {
          router.push(`/${lang}/login?email=${encodeURIComponent(email)}`);
        } else {
          setError(signUpError?.message || dict.error);
        }
        return;
      }

      toast.success(dict.signupSuccess, {
        duration: 60_000,
        cancel: (
          <Button onClick={() => toast.dismiss()} size="sm" variant="outline">
            Ok
          </Button>
        ),
      });
    } catch (_error) {
      setIsLoading(false);
      setError(dict.error || 'Error creating account');
    }
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message || dict.error);
      setIsLoading(false);
      return;
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="email">{dict.email}</Label>
        <Input
          autoComplete="email"
          id="email"
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{dict.password}</Label>
        <Input
          autoComplete="new-password"
          id="password"
          onChange={(e) => setPassword(e.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <Button className="w-full" disabled={isLoading} type="submit">
        {isLoading ? 'Loading...' : dict.submit}
      </Button>

      <Button
        className="w-full"
        disabled={isLoading}
        onClick={loginWithGoogle}
        variant="secondary"
      >
        <LogosGoogleIcon />
        Sign up with Google
      </Button>

      <p className="text-center text-gray-500 text-sm">
        {dict.hasAccount}{' '}
        <Link
          className="text-blue-600 hover:text-blue-500"
          href={`/${lang}/login`}
        >
          {dict.signIn}
        </Link>
      </p>
    </form>
  );
}
