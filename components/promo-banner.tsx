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

    // Check if banner was previously dismissed
    const isDismissed = document.cookie
      .split(';')
      .some((cookie) => cookie.trim().startsWith(`${PROMO_BANNER_COOKIE}=`));

    if (!isDismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismissBanner = async () => {
    await dismissBannerAction();
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        'container text-white sm:py-3 py-1 relative mx-auto px-4 sm:h-8 sm:flex flex-inline items-center justify-between',
        {
          'px-2': inDashboard,
          'pb-3': inDashboard,
        },
      )}
    >
      <div className="flex-1 sm:text-center text-left">
        <p className="text-sm md:text-base font-medium truncate text-wrap sm:text-nowrap sm:whitespace-normal whitespace-pre-line">
          {text}
        </p>
      </div>

      <div className="flex items-center gap-2 justify-center sm:mt-0 mt-3">
        <Button
          asChild
          size="sm"
          variant="outline"
          className="text-orange-600 hover:bg-gray-900 font-semibold whitespace-nowrap"
        >
          <Link href={ctaLink}>{ctaText} 🎃</Link>
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="text-orange-700 hover:bg-gray-900"
          onClick={handleDismissBanner}
          aria-label={arialLabelDismiss}
        >
          <XIcon size={18} strokeWidth={3} />
        </Button>
      </div>
    </div>
  );
}
