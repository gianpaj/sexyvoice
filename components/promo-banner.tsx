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

  const now = new Date().getTime();
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

    // Check if banner was previously dismissed
    const isDismissed = document.cookie
      .split(';')
      .some((cookie) => cookie.trim().startsWith(`${PROMO_BANNER_COOKIE}=`));

    if (!isDismissed) {
      setIsVisible(true);
    }
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!countdown?.enabled || !countdown?.endDate) {
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
  }, [countdown]);

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

          {countdown?.enabled && timeRemaining && !timeRemaining.expired && (
            <div className="flex flex-col items-center sm:items-center gap-2 mt-3">
              <p className="text-sm font-semibold text-white">
                {countdown.labels.prefix}
              </p>
              <div className="flex justify-center sm:justify-center gap-3 text-xs sm:text-sm font-mono">
                <div className="flex flex-col items-center">
                  <span className="text-lg sm:text-xl font-bold text-orange-400">
                    {String(timeRemaining.days).padStart(2, '0')}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {countdown.labels.days}
                  </span>
                </div>
                <span className="text-orange-400 text-lg sm:text-xl font-bold">:</span>
                <div className="flex flex-col items-center">
                  <span className="text-lg sm:text-xl font-bold text-orange-400">
                    {String(timeRemaining.hours).padStart(2, '0')}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {countdown.labels.hours}
                  </span>
                </div>
                <span className="text-orange-400 text-lg sm:text-xl font-bold">:</span>
                <div className="flex flex-col items-center">
                  <span className="text-lg sm:text-xl font-bold text-orange-400">
                    {String(timeRemaining.minutes).padStart(2, '0')}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {countdown.labels.minutes}
                  </span>
                </div>
                <span className="text-orange-400 text-lg sm:text-xl font-bold">:</span>
                <div className="flex flex-col items-center">
                  <span className="text-lg sm:text-xl font-bold text-orange-400">
                    {String(timeRemaining.seconds).padStart(2, '0')}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {countdown.labels.seconds}
                  </span>
                </div>
              </div>
            </div>
          )}
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
