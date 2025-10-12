'use client';

import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { dismissBannerAction } from '@/app/[lang]/actions/promos';
import { Button } from '@/components/ui/button';

interface HalloweenBannerProps {
  text: string;
  ctaLink: string;
  ctaText: string;
  arialLabelDismiss: string;
  isEnabled?: boolean;
}

const HALLOWEEN_BANNER_COOKIE = 'halloween-banner-dismissed-2025';

export function HalloweenBanner({
  text,
  ctaLink,
  ctaText,
  arialLabelDismiss,
  isEnabled = false,
}: HalloweenBannerProps) {
  const [isVisible, setIsVisible] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: no need
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    // Check if banner was previously dismissed
    const isDismissed = document.cookie
      .split(';')
      .some((cookie) =>
        cookie.trim().startsWith(`${HALLOWEEN_BANNER_COOKIE}=`),
      );

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
    <div className=" from-orange-600 to-purple-600 text-white px-4 py-3 relative">
      <div className="container mx-auto px-4 sm:h-8 sm:flex flex-inline items-center justify-between">
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
    </div>
  );
}
