'use client';

import Image from 'next/image';
import Link from 'next/link';

import logoSmall from '@/app/assets/S-logo-transparent-small.png';
import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';

export function HeaderStatic({
  lang,
  dict,
}: {
  lang: Locale;
  dict: (typeof langDict)['header'];
}) {
  return (
    <nav className="fixed top-2 left-1/2 z-50 flex w-full -translate-x-1/2 items-center justify-center px-4 lg:top-8">
      <div className="flex w-full max-w-xl items-center justify-between gap-2.5 rounded-full bg-[hsla(0,0%,96%,0.72)] pt-2 pr-4 pb-2 pl-6 backdrop-blur-xl">
        <Link className="flex items-center" href={`/${lang}`}>
          <Image alt="Logo" height={292 / 8} src={logoSmall} width={221 / 8} />
          <span className="font-semibold text-gray-900 text-xl">
            exyVoice.ai
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-4 md:flex">
          <Button asChild className="rounded-full" variant="ghost">
            <Link
              className="text-gray-700"
              href={`/${lang}/login`}
              prefetch
            >
              {dict.login}
            </Link>
          </Button>
          <Link
            className="flex h-11 items-center justify-center gap-2.5 text-nowrap rounded-full bg-card-foreground px-4 py-[9px] font-semibold text-md text-white leading-[1.2em] tracking-[-0.025em]"
            href={`/${lang}/signup`}
            prefetch
          >
            {dict.signup}
          </Link>
        </div>

        {/* Mobile Navigation */}
        <div className="flex md:hidden">
          <Link
            className="flex h-11 items-center justify-center gap-2.5 text-nowrap rounded-full bg-card-foreground px-4 py-[9px] font-semibold text-md text-white leading-[1.2em] tracking-[-0.025em]"
            href={`/${lang}/signup`}
            prefetch
          >
            {dict.signup}
          </Link>
        </div>
      </div>
    </nav>
  );
}
