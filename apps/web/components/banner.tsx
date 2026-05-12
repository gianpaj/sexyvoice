'use client';

import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';

import { dismissBannerAction } from '@/app/[lang]/actions/banners';
import { Button } from '@/components/ui/button';
import { useIsMobileSizes } from '@/hooks/use-mobile';
import type { ResolvedBanner } from '@/lib/banners/types';
import { getCookie } from '@/lib/cookies';
import { cn } from '@/lib/utils';

interface TimeRemaining {
  days: number;
  expired: boolean;
  hours: number;
  minutes: number;
  seconds: number;
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

export function Banner({
  banner,
  inDashboard,
}: {
  banner: ResolvedBanner;
  inDashboard?: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(
    null,
  );
  const { innerWidth } = useIsMobileSizes();

  useEffect(() => {
    let isCancelled = false;

    const resolveVisibility = async () => {
      if (!(banner.dismissible && banner.dismissCookieKeys.length > 0)) {
        return true;
      }

      const cookieValues = await Promise.all(
        banner.dismissCookieKeys.map((cookieKey) => getCookie(cookieKey)),
      );

      return cookieValues.every((cookieValue) => !cookieValue);
    };

    resolveVisibility().then((visible) => {
      if (!isCancelled) {
        setIsVisible(visible);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [banner.dismissCookieKeys, banner.dismissible]);

  useEffect(() => {
    if (!(banner.countdown?.enabled && banner.countdown.endDate)) {
      setTimeRemaining(null);
      return;
    }

    const initial = calculateTimeRemaining(banner.countdown.endDate);
    setTimeRemaining(initial);

    if (initial === null) {
      return;
    }

    if (initial.expired) {
      return;
    }

    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining(banner.countdown?.endDate || '');

      if (remaining === null) {
        setTimeRemaining(null);
        clearInterval(interval);
        return;
      }

      setTimeRemaining(remaining);

      if (remaining.expired) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [banner.countdown?.enabled, banner.countdown?.endDate]);

  const handleDismissBanner = async () => {
    await dismissBannerAction(banner.id);
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  const isLongText = banner.text.length > 100;

  return (
    <div
      className={cn('w-full', {
        'fixed z-50 bg-promo-primary-dark/50 backdrop-blur-sm': inDashboard,
      })}
      data-promo-theme={banner.theme}
    >
      <div
        className={cn(
          'relative mx-auto flex-inline items-center justify-center gap-32 px-4 py-4 pb-3 text-white lg:container portrait:container sm:flex sm:py-8',
          isLongText ? 'sm:h-16' : 'sm:h-8',
        )}
      >
        <div className="flex flex-col items-center justify-stretch gap-3 text-left sm:flex-row sm:gap-10 sm:text-center">
          <p
            className={cn(
              'truncate whitespace-pre-line text-wrap font-medium text-sm sm:whitespace-normal md:text-base',
              {
                'sm:text-nowrap': !isLongText && innerWidth > 1000,
              },
            )}
          >
            {banner.text}
          </p>

          {banner.countdown?.enabled &&
            timeRemaining &&
            !timeRemaining.expired && (
              <div className="flex items-center gap-4">
                <p className="font-semibold text-sm text-white">
                  {banner.countdown.labels.prefix}
                </p>
                <div className="flex gap-0 font-mono text-xs sm:text-sm">
                  {[
                    timeRemaining.days,
                    timeRemaining.hours,
                    timeRemaining.minutes,
                    timeRemaining.seconds,
                  ].map((num, index) => (
                    <Fragment key={`${banner.id}-${index}`}>
                      {index !== 0 && (
                        <span className="font-bold text-lg sm:text-xl">:</span>
                      )}
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-lg sm:text-xl">
                          {String(num).padStart(2, '0')}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
        </div>

        <div className="relative right-0 mt-3 flex items-center justify-center gap-2 px-4 md:absolute md:mt-0">
          <Button
            asChild
            className="whitespace-nowrap bg-promo-primary-dark font-semibold hover:bg-promo-text-dark hover:ring-promo-text-dark"
            effect="ringHover"
            size="sm"
            variant="outline"
          >
            <Link href={banner.ctaLink}>{banner.ctaText}</Link>
          </Button>

          {banner.dismissible && (
            <Button
              aria-label={banner.ariaLabelDismiss}
              className="absolute right-0 md:relative"
              onClick={handleDismissBanner}
              size="sm"
              variant="ghost"
            >
              <XIcon size={18} strokeWidth={3} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
