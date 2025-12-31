'use client';

import Image from 'next/image';
import Link from 'next/link';

import logoSmall from '@/app/assets/S-logo-transparent-small.png';
import { Button } from '@/components/ui/button';
import { useIsMobileSizes } from '@/hooks/use-mobile';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';

export function HeaderStatic({
  lang,
  dict,
}: {
  lang: Locale;
  dict: (typeof langDict)['header'];
}) {
  const { isMobile375 } = useIsMobileSizes();

  return (
    <header className="border-gray-700 border-b bg-gray-900">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link className="z-10 flex items-end gap-0" href={`/${lang}`}>
          <Image alt="Logo" height={292 / 8} src={logoSmall} width={221 / 8} />
          <span className="font-semibold text-white text-xl">exyVoice.ai</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="z-10 hidden items-center justify-center gap-4 md:flex">
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
        </div>

        {/* Mobile Navigation */}
        <div className="z-10 flex gap-2 md:hidden">
          <Button
            asChild
            size={isMobile375 && lang !== 'en' ? 'xs' : 'sm'}
            variant="secondary"
          >
            <Link className="w-full" href={`/${lang}/login`} prefetch>
              {dict.login}
            </Link>
          </Button>
          <Button asChild size={isMobile375 && lang !== 'en' ? 'xs' : 'sm'}>
            <Link className="w-full" href={`/${lang}/signup`} prefetch>
              {dict.signup}
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
