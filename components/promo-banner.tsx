'use client';

import { XIcon } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

import { dismissBannerAction } from '@/app/[lang]/actions/promos';
import { Button } from '@/components/ui/button';
import { getCookie } from '@/lib/cookies';
import { cn } from '@/lib/utils';

interface PromoBannerProps {
  inDashboard?: boolean;
  text: string;
  ctaLink: string;
  ctaText: string;
  arialLabelDismiss: string;
  isEnabled?: boolean;
  countdown?: {
    enabled: boolean;
    endDate: string; // UTC ISO date string
    labels: {
      prefix: string;
      days: string;
      hours: string;
      minutes: string;
      seconds: string;
    };
  };
}

const PROMO_BANNER_COOKIE = `${process.env.NEXT_PUBLIC_PROMO_ID}-dismissed`;

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function calculateTimeRemaining(endDate: string): TimeRemaining | null {
  const parsedEnd = new Date(endDate);
  if (Number.isNaN(parsedEnd.getTime())) {
    return null;
  }

  const now = Date.now();
  const end = parsedEnd.getTime();
  const distance = end - now;

  if (distance < 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  return {
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((distance % (1000 * 60)) / 1000),
    expired: false,
  };
}

export function PromoBanner({
  inDashboard,
  text,
  ctaLink,
  ctaText,
  arialLabelDismiss,
  isEnabled = false,
  countdown,
}: PromoBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(
    null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: no need
  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    const checkCookie = async () => {
      const promoBannerCookie = await getCookie(PROMO_BANNER_COOKIE);

      if (!promoBannerCookie) {
        setIsVisible(true);
      }
    };

    checkCookie();
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!(countdown?.enabled && countdown?.endDate)) {
      return;
    }

    // Initialize countdown
    const initial = calculateTimeRemaining(countdown.endDate);
    setTimeRemaining(initial);

    if (initial === null) {
      return;
    }

    if (initial.expired) {
      setIsVisible(false);
      return;
    }

    // Update countdown every second
    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining(countdown.endDate);

      if (remaining === null) {
        setTimeRemaining(null);
        clearInterval(interval);
        return;
      }

      setTimeRemaining(remaining);

      // Hide banner when countdown expires
      if (remaining.expired) {
        setIsVisible(false);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown?.enabled, countdown?.endDate]);

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
        'fixed z-50 bg-pink-900/30 backdrop-blur-sm': inDashboard,
      })}
    >
      <div
        className={cn(
          'relative mx-auto flex-inline items-center justify-center gap-32 px-4 py-4 pb-3 text-white lg:container portrait:container sm:flex sm:py-6',
          isLongText ? 'sm:h-16' : 'sm:h-8',
        )}
      >
        <div className="flex flex-col items-center justify-stretch gap-3 text-left sm:flex-row sm:gap-10 sm:text-center">
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

          {countdown?.enabled && timeRemaining && !timeRemaining.expired && (
            <div className="flex items-center gap-4">
              <p className="font-semibold text-sm text-white">
                {countdown.labels.prefix}
              </p>
              <div className="flex gap-0 font-mono text-xs sm:text-sm">
                {[
                  timeRemaining.days,
                  timeRemaining.hours,
                  timeRemaining.minutes,
                  timeRemaining.seconds,
                ].map((num, i) => (
                  <React.Fragment key={i}>
                    {i !== 0 && (
                      <span className="font-bold text-lg sm:text-xl">:</span>
                    )}
                    <div className="flex flex-col items-center">
                      <span className="font-bold text-lg sm:text-xl">
                        {String(num).padStart(2, '0')}
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative right-0 mt-3 flex items-center justify-center gap-2 px-4 sm:absolute sm:mt-0">
          <Button
            asChild
            className="whitespace-nowrap bg-pink-600/70 font-semibold hover:bg-pink-900"
            size="sm"
            variant="outline"
          >
            <Link href={ctaLink}>{ctaText}</Link>
          </Button>

          <Button
            aria-label={arialLabelDismiss}
            className="absolute right-0 md:relative"
            onClick={handleDismissBanner}
            size="sm"
            variant="ghost"
          >
            <XIcon size={18} strokeWidth={3} />
          </Button>
        </div>
      </div>
    </div>
  );
}
