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
  dict: typeof langDict;
  lang: Locale;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const dictSignup = dict.auth.signup;

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

      const res = await fetch('/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        toast.success(dictSignup.signupSuccess, {
          duration: 60_000,
          cancel: (
            <Button onClick={() => toast.dismiss()} size="sm" variant="outline">
              Ok
            </Button>
          ),
        });
        return;
      }

      const { error: signUpError, data } = await res.json();

      const errorCode = signUpError?.message as keyof typeof dict.errorCodes;

      if (signUpError || !data.user) {
        console.error(signUpError, data);
        // TODO: handle if user already exists. Supabase returns a fake user if the email is already registered. (https://github.com/supabase/auth/issues/1517)
        if (signUpError?.message === 'VALIDATION_ERROR_EMAIL_EXISTS') {
          router.push(`/${lang}/login?email=${encodeURIComponent(email)}`);
        } else if (errorCode && dict.errorCodes[errorCode]) {
          if (signUpError.seconds) {
            setError(
              dict.errorCodes[errorCode].replace(
                '_XX_',
                signUpError.seconds.toString(),
              ),
            );
          } else {
            setError(dict.errorCodes[errorCode]);
          }
        } else {
          setError(signUpError?.message || dictSignup.error);
        }
        return;
      }
    } catch (_error) {
      console.error(_error);

      setError(dictSignup.error || 'Error creating account');
    } finally {
      setIsLoading(false);
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
      setError(error.message || dictSignup.error);
      setIsLoading(false);
      return;
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="email">{dictSignup.email}</Label>
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
        <Label htmlFor="password">{dictSignup.password}</Label>
        <Input
          autoComplete="new-password"
          id="password"
          maxLength={25}
          minLength={6}
          onChange={(e) => setPassword(e.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <Button className="w-full" disabled={isLoading} type="submit">
        {isLoading ? 'Loading...' : dictSignup.submit}
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
        {dictSignup.hasAccount}{' '}
        <Link
          className="text-blue-600 hover:text-blue-500"
          href={`/${lang}/login`}
        >
          {dictSignup.signIn}
        </Link>
      </p>
    </form>
  );
}
