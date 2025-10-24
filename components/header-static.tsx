import Image from 'next/image';
import Link from 'next/link';

import logoSmall from '@/app/assets/S-logo-transparent-small.png';
// import { LanguageSelector } from './language-selector';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';

export async function HeaderStatic({ lang }: { lang: Locale }) {
  const dict = await getDictionary(lang, 'pages');
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
          <span className="text-xl text-white font-semibold">exyVoice.ai</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-4 justify-center z-10">
          {/* <LanguageSelector currentLang={lang} isMobile={false} /> */}

          <div className="space-x-4">
            <Button variant="secondary" asChild>
              <Link href={`/${lang}/login`} prefetch>
                {dict['/login']}
              </Link>
            </Button>
            <Button variant="default" asChild effect="ringHover">
              <Link href={`/${lang}/signup`} prefetch>
                {dict['/signup']}
              </Link>
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden z-10 flex gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/${lang}/login`} className="w-full" prefetch>
              {dict['/login']}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/${lang}/signup`} className="w-full" prefetch>
              {dict['/signup']}
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
