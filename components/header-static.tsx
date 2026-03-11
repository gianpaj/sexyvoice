'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

import logoSmall from '@/app/assets/S-logo-transparent-small.png';
import { Button } from '@/components/ui/button';
import { useIsMobileSizes } from '@/hooks/use-mobile';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';

export function HeaderStatic() {
  const locale = useLocale() as Locale;
  const t = useTranslations('header');
  const { isMobile375 } = useIsMobileSizes();

  return (
    <header className="border-gray-700 border-b bg-gray-900">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link className="hit-area-2 z-10 flex items-end gap-0" href={'/'}>
          <Image alt="Logo" height={292 / 8} src={logoSmall} width={221 / 8} />
          <span className="font-semibold text-white text-xl">exyVoice.ai</span>
        </Link>

        <div className="z-10 hidden items-center justify-center gap-4 md:flex">
          <div className="space-x-4">
            <Button asChild variant="secondary">
              <Link href="/login" prefetch>
                {t('login')}
              </Link>
            </Button>
            <Button asChild effect="ringHover" variant="default">
              <Link href="/signup" prefetch>
                {t('signup')}
              </Link>
            </Button>
          </div>
        </div>

        <div className="z-10 flex gap-2 md:hidden">
          <Button
            asChild
            className="hit-area-2"
            size={isMobile375 && locale !== 'en' ? 'xs' : 'sm'}
            variant="secondary"
          >
            <Link className="w-full" href="/login" prefetch>
              {t('login')}
            </Link>
          </Button>
          <Button
            asChild
            className="hit-area-2"
            size={isMobile375 && locale !== 'en' ? 'xs' : 'sm'}
          >
            <Link className="w-full" href="/signup" prefetch>
              {t('signup')}
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
