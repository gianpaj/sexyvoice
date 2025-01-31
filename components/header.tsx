import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export async function Header({ lang }: { lang: string }) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  return (
    <header className="border-b border-gray-700 bg-gray-900">
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href={`/${lang}`} className="text-xl font-semibold text-white">
          SexyVoice.ai
        </Link>

        <div>
          {user ? (
            <Link
              href={`/${lang}/dashboard`}
              className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <div className="space-x-4">
              <Link
                href={`/${lang}/login`}
                className="px-4 py-2 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Login
              </Link>
              <Link
                href={`/${lang}/signup`}
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
