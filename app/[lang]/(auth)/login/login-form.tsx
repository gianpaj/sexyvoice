'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogosGoogleIcon } from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';

export function LoginForm({
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
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message || dict.error);
      setIsLoading(false);
      return;
    }

    router.push(`/${lang}/dashboard/generate`);
    router.refresh();
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="email">{dict.email}</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center">
          <Label htmlFor="password">{dict.password}</Label>
          <Link
            href={`/${lang}/reset-password`}
            className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
          >
            {dict.forgotPassword || 'Forgot your password?'}
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
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
        <LogosGoogleIcon />
        Login with Google
      </Button>

      <p className="text-center text-sm text-gray-500">
        {dict.noAccount}{' '}
        <Link
          href={`/${lang}/signup`}
          className="text-blue-600 hover:text-blue-500"
        >
          {dict.signUp}
        </Link>
      </p>
    </form>
  );
}
