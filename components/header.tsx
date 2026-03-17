import Image from 'next/image';
import { getMessages } from 'next-intl/server';

import logoSmall from '@/app/assets/S-logo-transparent-small.png';
// import { LanguageSelector } from './language-selector';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

export async function Header({ lang: _lang }: { lang: Locale }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  const dict = (await getMessages({ locale: _lang })) as IntlMessages;

  return (
    <header className="border-gray-700 border-b bg-gray-900">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link className="z-10 flex items-end gap-0" href="/">
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
              <Link href="/dashboard/generate" prefetch>
                {dict.header.generate}
              </Link>
            </Button>
          ) : (
            <div className="space-x-4">
              <Button asChild variant="secondary">
                <Link href="/login" prefetch>
                  {dict.header.login}
                </Link>
              </Button>
              <Button asChild effect="ringHover" variant="default">
                <Link href="/signup" prefetch>
                  {dict.header.signup}
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
                href="/dashboard/generate"
                prefetch
              >
                {dict.header.generate}
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="secondary">
                <Link className="w-full" href="/login" prefetch>
                  {dict.header.login}
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link className="w-full" href="/signup" prefetch>
                  {dict.header.signup}
                </Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
