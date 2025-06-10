'use client';

import { Icon } from '@iconify/react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

export function SignUpForm({
  dict,
  lang,
}: {
  dict: Record<string, string>;
  lang: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
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
          // setError(
          //   'An account with this email already exists. Please login instead.',
          // );
        } else {
          setError(signUpError?.message || dict.error);
        }
        return;
      }

      toast.success(dict.signupSuccess, {
        duration: 60000,
        cancel: (
          <Button variant="outline" size="sm" onClick={() => toast.dismiss()}>
            Ok
          </Button>
        ),
      });
    } catch (error) {
      setIsLoading(false);
      setError(dict.error || 'Error creating account');
    }
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    setError(null);

    const { error, data } = await supabase.auth.signInWithOAuth({
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <div className="grid gap-2">
          <Label htmlFor="email">{dict.email}</Label>
          <Input
            id="email"
            type="email"
            placeholder={dict.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{dict.password}</Label>
          <Input
            id="password"
            type="password"
            placeholder={dict.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Loading...' : dict.submit}
      </Button>

      <Button
        onClick={loginWithGoogle}
        variant="secondary"
        className="w-full"
        disabled={isLoading}
      >
        <Icon icon="logos:google-icon" width="256" height="262" />
        Sign up with Google
      </Button>

      <p className="text-center text-sm text-gray-500">
        {dict.hasAccount}{' '}
        <Link
          href={`/${lang}/login`}
          className="text-blue-600 hover:text-blue-500"
        >
          {dict.signIn}
        </Link>
      </p>
    </form>
  );
}
