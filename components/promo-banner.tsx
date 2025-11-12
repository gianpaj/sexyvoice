'use client';

import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { dismissBannerAction } from '@/app/[lang]/actions/promos';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PromoBannerProps {
  inDashboard?: boolean;
  text: string;
  ctaLink: string;
  ctaText: string;
  arialLabelDismiss: string;
  isEnabled?: boolean;
}

const PROMO_BANNER_COOKIE = `${process.env.NEXT_PUBLIC_PROMO_ID}-dismissed`;

export function PromoBanner({
  inDashboard,
  text,
  ctaLink,
  ctaText,
  arialLabelDismiss,
  isEnabled = false,
}: PromoBannerProps) {
  const [isVisible, setIsVisible] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: no need
  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    const getCookie = async () => {
      const promoBannerCookie = await cookieStore.get(PROMO_BANNER_COOKIE);

      if (!promoBannerCookie) {
        setIsVisible(true);
      }
    };

    getCookie();
  }, []);

  const handleDismissBanner = async () => {
    await dismissBannerAction();
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  const isLongText = text.length > 100;

  return (
    <div
      className={cn('w-full', {
        'fixed z-50 bg-red-900/30 backdrop-blur-sm': inDashboard,
      })}
    >
      <div
        className={cn(
          'relative mx-auto flex-inline items-center justify-between gap-4 px-4 py-4 pb-3 text-white lg:container portrait:container sm:flex sm:py-6',
          isLongText ? 'sm:h-16' : 'sm:h-8',
        )}
      >
        <div className="flex-1 text-left sm:text-center">
          <p
            className={cn(
              'truncate whitespace-pre-line text-wrap font-medium text-sm sm:whitespace-normal md:text-base',
              {
                'sm:text-nowrap': !isLongText,
              },
            )}
          >
            {text}
          </p>
        </div>

        <div className="relative mt-3 flex flex-[0.3] items-center justify-center gap-2 sm:mt-0">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="whitespace-nowrap bg-gray-800/70 font-semibold text-orange-600 hover:bg-gray-900"
          >
            <Link href={ctaLink}>{ctaText} 🎃</Link>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="absolute right-0 text-orange-700 md:relative"
            onClick={handleDismissBanner}
            aria-label={arialLabelDismiss}
          >
            <XIcon size={18} strokeWidth={3} />
          </Button>
        </div>
      </div>
    </div>
  );
}
