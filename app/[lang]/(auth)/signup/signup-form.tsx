'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export function SignUpForm({
  dict,
  lang,
}: { dict: Record<string, string>; lang: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error: signUpError, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          username,
        },
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
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Input
          type="email"
          placeholder={dict.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
        />
        <Input
          type="text"
          placeholder={dict.username}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder={dict.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Loading...' : dict.submit}
      </Button>

      <p className="text-center text-sm text-gray-600">
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
