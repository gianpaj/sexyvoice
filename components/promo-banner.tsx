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
      className={cn('w-full ', {
        'bg-red-900/30 backdrop-blur-sm fixed z-50': inDashboard,
      })}
    >
      <div
        className={cn(
          'portrait:container lg:container text-white sm:py-6 py-4 relative mx-auto px-4 sm:flex flex-inline items-center justify-between pb-3 gap-4',
          isLongText ? 'sm:h-16' : 'sm:h-8',
        )}
      >
        <div className="flex-1 sm:text-center text-left">
          <p
            className={cn(
              'text-sm md:text-base font-medium truncate text-wrap sm:whitespace-normal whitespace-pre-line',
              {
                'sm:text-nowrap': !isLongText,
              },
            )}
          >
            {text}
          </p>
        </div>

        <div className="flex items-center justify-center sm:mt-0 mt-3 relative gap-2 flex-[0.3]">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="text-orange-600 hover:bg-gray-900 bg-gray-800/70 font-semibold whitespace-nowrap"
          >
            <Link href={ctaLink}>{ctaText} 🎃</Link>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-orange-700 absolute md:relative right-0"
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
