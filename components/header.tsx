import Image from 'next/image';
import Link from 'next/link';
import logoSmall from '@/app/assets/S-logo-transparent-small.png';
// import { LanguageSelector } from './language-selector';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

export async function Header({ lang }: { lang: string }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  return (
    <header className="border-b border-gray-700 bg-gray-900">
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href={`/${lang}`} className="z-10 gap-0 items-end flex">
          <div className="aspect-square">
            <Image
              src={logoSmall}
              alt="Logo"
              width={221 / 8}
              height={292 / 8}
            />
          </div>
          {/* <div className="flex h-16 items-center px-6"> */}
          <span className="text-xl text-white font-semibold">exyVoice.ai</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-4 justify-center z-10">
          {/* <LanguageSelector currentLang={lang} isMobile={false} /> */}

          {user ? (
            <Button variant="default" asChild>
              <Link href={`/${lang}/dashboard`} prefetch>
                Dashboard
              </Link>
            </Button>
          ) : (
            <div className="space-x-4">
              <Button variant="secondary" asChild>
                <Link href={`/${lang}/login`} prefetch>
                  Login
                </Link>
              </Button>
              <Button variant="default" asChild>
                <Link href={`/${lang}/signup`} prefetch>
                  Sign Up
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden z-10 flex gap-2">
          {/* <LanguageSelector isMobile currentLang={lang} /> */}
          {user ? (
            <Link href={`/${lang}/dashboard`} className="w-full" prefetch>
              Dashboard
            </Link>
          ) : (
            <>
              <Button asChild size="sm" variant="secondary">
                <Link href={`/${lang}/login`} className="w-full" prefetch>
                  Login
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link
                  href={`/${lang}/signup`}
                  className="w-full text-white"
                  prefetch
                >
                  Sign Up
                </Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
