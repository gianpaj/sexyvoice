'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/supabase';

export function SignUpForm({ dict, lang }: { dict: any; lang: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error: signUpError, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          full_name: fullName,
        },
      },
    });

    if (signUpError) {
      setError(dict.error);
      setIsLoading(false);
      return;
    }

    // Create profile
    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: data.user!.id,
        username,
        full_name: fullName,
      },
    ]);

    if (profileError) {
      setError(dict.error);
      setIsLoading(false);
      return;
    }

    router.push(`/${lang}/dashboard`);
    router.refresh();
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
        />
        <Input
          type="text"
          placeholder={dict.username}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <Input
          type="text"
          placeholder={dict.fullName}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder={dict.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
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
