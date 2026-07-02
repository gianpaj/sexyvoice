'use client';

import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';

import { dismissBannerAction } from '@/app/[lang]/actions/banners';
import { Button } from '@/components/ui/button';
import type { ResolvedBanner } from '@/lib/banners/types';
import { getCookie } from '@/lib/cookies';
import { usePathname } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

// The locale-aware pathname omits the locale prefix, while banner CTA links
// include it (e.g. `/en/dashboard/credits`). Strip the leading locale segment
// so we can tell when the CTA points to the page the user is already on.
function stripLocalePrefix(href: string) {
  return href.replace(/^\/[^/]+/, '') || '/';
}

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
  const pathname = usePathname();

  // Hide the CTA when it would link to the page the user is already viewing
  // (e.g. the card-bonus banner's "add a card" button on the credits page).
  const isOnCtaPage = pathname === stripLocalePrefix(banner.ctaLink);

  useEffect(() => {
    let isCancelled = false;

    // Hide immediately so a previously-visible banner doesn't flash while the
    // async cookie check for the new banner resolves.
    setIsVisible(false);

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
    await dismissBannerAction(banner.id);
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn('w-full', {
        'fixed z-50 bg-promo-primary-dark/50 backdrop-blur-sm': inDashboard,
      })}
      data-promo-theme={banner.theme}
    >
      <div
        className="relative mx-auto flex flex-col items-center gap-3 px-4 text-white lg:container portrait:container sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
        style={{ paddingBlock: 'clamp(0.5rem, 1.5vw, 1rem)' }}
      >
        <div className="flex min-w-0 flex-col items-center justify-center gap-3 text-center sm:flex-row sm:gap-6">
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

        <div className="flex shrink-0 items-center justify-center gap-2">
          {!isOnCtaPage && (
            <Button
              asChild
              className="whitespace-nowrap bg-promo-primary-dark font-semibold hover:bg-promo-text-dark hover:ring-promo-text-dark"
              effect="ringHover"
              size="sm"
              variant="outline"
            >
              <Link href={banner.ctaLink}>{banner.ctaText}</Link>
            </Button>
          )}

          {banner.dismissible && (
            <Button
              aria-label={banner.ariaLabelDismiss}
              className="shrink-0"
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
