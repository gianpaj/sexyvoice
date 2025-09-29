'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/i18n-config';

interface HalloweenBannerProps {
  lang: Locale;
  text: string;
  ctaText: string;
  ctaLink: string;
  isEnabled?: boolean;
}

const HALLOWEEN_BANNER_COOKIE = 'halloween-banner-dismissed-2025';
const COOKIE_EXPIRY_DAYS = 30;

export function HalloweenBanner({
  lang,
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
      .some(cookie => cookie.trim().startsWith(`${HALLOWEEN_BANNER_COOKIE}=`));
    
    if (!isDismissed) {
      setIsVisible(true);
    }
  }, []);

  const dismissBanner = () => {
    // Set cookie to expire in 30 days
    const expiryDate = new Date();
    expiryDate.setTime(expiryDate.getTime() + (COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000));
    
    document.cookie = `${HALLOWEEN_BANNER_COOKIE}=true; expires=${expiryDate.toUTCString()}; path=/`;
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-orange-600 to-purple-600 text-white px-4 py-3 relative">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <span className="text-xl">🎃👻</span>
          <p className="text-sm md:text-base font-medium truncate">
            {text}
          </p>
        </div>
        
        <div className="flex items-center space-x-2 ml-4">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="bg-white text-orange-600 hover:bg-gray-100 font-semibold whitespace-nowrap"
          >
            <Link href={ctaLink}>
              {ctaText} 🎃
            </Link>
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/20 p-1 h-8 w-8"
            onClick={dismissBanner}
            aria-label="Dismiss Halloween banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}