import Image from 'next/image';
import Link from 'next/link';

import logoSmall from '@/app/assets/S-logo-transparent-small.png';
// import { LanguageSelector } from './language-selector';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';

export async function Header({ lang }: { lang: Locale }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  const dict = await getDictionary(lang, 'header');

  return (
    <header className="border-gray-700 border-b bg-gray-900">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link className="z-10 flex items-end gap-0" href={`/${lang}`}>
          <div className="aspect-square">
            <Image
              alt="Logo"
              height={292 / 8}
              src={logoSmall}
              width={221 / 8}
            />
          </div>
          {/* <div className="flex h-16 items-center px-6"> */}
          <span className="font-semibold text-white text-xl">exyVoice.ai</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="z-10 hidden items-center justify-center gap-4 md:flex">
          {/* <LanguageSelector currentLang={lang} isMobile={false} /> */}

          {user ? (
            <Button asChild variant="default">
              <Link href={`/${lang}/dashboard/call`} prefetch>
                {dict.generate}
              </Link>
            </Button>
          ) : (
            <div className="space-x-4">
              <Button asChild variant="secondary">
                <Link href={`/${lang}/login`} prefetch>
                  {dict.login}
                </Link>
              </Button>
              <Button asChild effect="ringHover" variant="default">
                <Link href={`/${lang}/signup`} prefetch>
                  {dict.signup}
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Mobile Navigation */}
        <div className="z-10 flex gap-2 md:hidden">
          {/* <LanguageSelector isMobile currentLang={lang} /> */}
          {user ? (
            <Button asChild variant="default">
              <Link
                className="w-full"
                href={`/${lang}/dashboard/call`}
                prefetch
              >
                {dict.generate}
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="secondary">
                <Link className="w-full" href={`/${lang}/login`} prefetch>
                  {dict.login}
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link className="w-full" href={`/${lang}/signup`} prefetch>
                  {dict.signup}
                </Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
