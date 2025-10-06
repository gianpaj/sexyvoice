'use client';

import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

interface HalloweenBannerProps {
  text: string;
  ctaText: string;
  ctaLink: string;
  isEnabled?: boolean;
}

const HALLOWEEN_BANNER_COOKIE = 'halloween-banner-dismissed-2025';
const COOKIE_EXPIRY_DAYS = 30;

export function HalloweenBanner({
  text,
  ctaText,
  ctaLink,
  isEnabled = false,
}: HalloweenBannerProps) {
  const [isVisible, setIsVisible] = useState(false);

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

  const dismissBanner = () => {
    // Set cookie to expire in 30 days
    const expiryDate = new Date();
    expiryDate.setTime(
      expiryDate.getTime() + COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    document.cookie = `${HALLOWEEN_BANNER_COOKIE}=true; expires=${expiryDate.toUTCString()}; path=/`;
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className=" from-orange-600 to-purple-600 text-white px-4 py-3 relative">
      <div className="container mx-auto px-4 h-8 flex items-center justify-between">
        <div className="flex-1 text-center">
          <p className="text-sm md:text-base font-medium truncate">{text}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="bg-white text-orange-600 hover:bg-gray-900 font-semibold whitespace-nowrap"
          >
            <Link href={ctaLink}>{ctaText} 🎃</Link>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-secondary bg-transparent hover:bg-background/10 hover:text-background"
            onClick={dismissBanner}
            aria-label="Dismiss Halloween banner"
          >
            <XIcon size={18} strokeWidth={3} />
          </Button>
        </div>
      </div>
    </div>
  );
}
