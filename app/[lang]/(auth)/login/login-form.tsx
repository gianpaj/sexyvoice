'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocalStorage } from '@/hooks/use-local-storage';
import type { Locale } from '@/lib/i18n/i18n-config';
import { LogosGoogleIcon } from '@/lib/icons';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type langDict from '@/messages/en.json';

export function LoginForm({
  dict,
  lang,
}: {
  dict: (typeof langDict)['auth']['login'];
  lang: Locale;
}) {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect_to');
  const [lastUsedAuth, setLastUsedAuth] = useLocalStorage('lastUsedAuth', '');
  const lastUsedAuthFixed = useRef(lastUsedAuth);

  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const nextPath =
    redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
      ? redirectTo
      : `/${lang}/dashboard/generate`;

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
    setLastUsedAuth('email');

    router.push(nextPath);
    router.refresh();
  };

  const signInWithGoogle = async () => {
    setIsLoading(true);
    setError(null);

    const callbackUrl = `${window.location.origin}/auth/callback?redirect_to=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      setError(error.message || dict.error);
      setIsLoading(false);
      return;
    }
    setLastUsedAuth('google');
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
        <div className="flex items-center">
          <Label htmlFor="password">{dict.password}</Label>
          <Link
            className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
            href={`/${lang}/reset-password`}
          >
            {dict.forgotPassword}
          </Link>
        </div>
        <Input
          autoComplete="current-password"
          id="password"
          onChange={(e) => setPassword(e.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="relative">
        {lastUsedAuthFixed.current === 'email' && <LastUsedBanner />}
        <Button className="w-full" disabled={isLoading} type="submit">
          {isLoading ? 'Loading...' : dict.submit}
        </Button>
      </div>

      <div className="relative">
        {lastUsedAuthFixed.current === 'google' && <LastUsedBanner />}
        <Button
          className="w-full gap-[10px]"
          disabled={isLoading}
          onClick={signInWithGoogle}
          variant="secondary"
        >
          <LogosGoogleIcon className="size-5" />
          {dict.signInWithGoogle}
        </Button>
      </div>

      <p className="text-center text-gray-500 text-sm">
        {dict.noAccount}{' '}
        <Link
          className="text-blue-600 hover:text-blue-500"
          href={`/${lang}/signup`}
        >
          {dict.signUp}
        </Link>
      </p>
    </form>
  );
}

function LastUsedBanner() {
  return (
    <Badge
      className="pointer-events-none absolute -top-2 -right-2 z-10 border-none bg-[#6c2243] px-[0.4rem]"
      variant="outline"
    >
      <span className="font-normal text-[11px] text-pink-200">Last used</span>
    </Badge>
  );
}
