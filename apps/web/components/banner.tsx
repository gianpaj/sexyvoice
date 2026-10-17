'use client';

import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { ResolvedBanner } from '@/lib/banners/types';
import { getCookie, setCookie } from '@/lib/cookies';
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
    return { days: 0, expired: true, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    expired: false,
    hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((distance % (1000 * 60)) / 1000),
  };
}

export function Banner({
  banner,
  inDashboard,
}: {
  banner: ResolvedBanner;
  inDashboard?: boolean;
}) {
  const [isVisible, setIsVisible] = useState(inDashboard === true);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(
    null,
  );

  useEffect(() => {
    // Dashboard resolution already filters dismissal cookies on the server.
    if (inDashboard) {
      setIsVisible(true);
      return;
    }

    let isCancelled = false;

    // Hide immediately so a previously-visible banner doesn't flash while the
    // async cookie check for the new banner resolves.
    setIsVisible(false);

    const resolveVisibility = async () => {
      if (!banner.dismissible) {
        return true;
      }

      const cookieValue = await getCookie(banner.dismiss.cookieKey);
      return !cookieValue;
    };

    resolveVisibility()
      .then((visible) => {
        if (!isCancelled) {
          setIsVisible(visible);
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [banner.dismiss.cookieKey, banner.dismissible, inDashboard]);

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
      setIsVisible(false);
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
        setIsVisible(false);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [banner.countdown?.enabled, banner.countdown?.endDate]);

  const handleDismissBanner = async () => {
    const expiryDate = new Date();
    expiryDate.setTime(
      expiryDate.getTime() + banner.dismiss.days * 24 * 60 * 60 * 1000,
    );

    setIsVisible(false);
    await setCookie(banner.dismiss.cookieKey, 'true', {
      expires: expiryDate,
      path: '/',
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn('w-full', {
        'shrink-0 border-promo-accent/20 border-b bg-promo-primary-dark/50':
          inDashboard,
      })}
      data-dashboard-banner={inDashboard ? '' : undefined}
      data-promo-theme={banner.theme}
    >
      <div
        className={cn(
          'relative mx-auto flex flex-col items-center gap-3 text-white',
          inDashboard
            ? 'justify-center gap-2 px-4 pt-3 pb-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-3 sm:px-14 sm:py-[clamp(0.375rem,1.5vw,1rem)]'
            : 'px-4 lg:container portrait:container sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4',
        )}
        style={{
          paddingBlock: inDashboard ? undefined : 'clamp(0.5rem, 1.5vw, 1rem)',
        }}
      >
        <div
          className={cn(
            'flex min-w-0 flex-col items-center justify-center gap-3 text-center sm:flex-row sm:gap-6',
            inDashboard && 'px-8 sm:px-0',
          )}
        >
          <p className="whitespace-pre-line text-wrap font-medium text-sm md:text-base">
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

        <div
          className={
            inDashboard
              ? 'contents'
              : 'flex shrink-0 items-center justify-center gap-2'
          }
        >
          <Button
            asChild
            className={cn(
              'whitespace-nowrap bg-promo-primary-dark font-semibold hover:bg-promo-text-dark hover:ring-promo-text-dark',
              inDashboard && 'shrink-0 sm:min-h-10',
            )}
            effect="ringHover"
            size="sm"
            variant="outline"
          >
            <Link href={banner.ctaLink}>{banner.ctaText}</Link>
          </Button>

          {banner.dismissible && (
            <Button
              aria-label={banner.ariaLabelDismiss}
              className={cn(
                'shrink-0 text-white hover:bg-promo-accent/20 hover:text-white focus-visible:ring-promo-accent',
                inDashboard &&
                  'absolute top-0 right-0 size-11 p-0 sm:top-1/2 sm:right-2 sm:-translate-y-1/2',
              )}
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
