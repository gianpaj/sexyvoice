'use client';

import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { type CSSProperties, Fragment, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { isBannerCountdownExpired } from '@/lib/banners/countdown';
import type { BannerArtwork, ResolvedBanner } from '@/lib/banners/types';
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

  if (isBannerCountdownExpired(endDate, now)) {
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

function ArtworkPicture({
  artwork,
  className,
}: {
  artwork: BannerArtwork;
  className: string;
}) {
  return (
    <picture>
      <source media="(width < 40rem)" srcSet={artwork.mobile.src} />
      {/* biome-ignore lint/performance/noImgElement: next/image cannot swap art-directed sources */}
      <img
        alt=""
        className={className}
        height={artwork.desktop.height}
        src={artwork.desktop.src}
        width={artwork.desktop.width}
      />
    </picture>
  );
}

/**
 * Pins each half of the artwork to its banner edge at full banner height, so
 * the corner decorations stay whole at any banner size. Each half is at most
 * half the image wide, so wide banners never repeat the art. Inner edges fade
 * into a blurred copy that fills the empty middle.
 */
function BannerArtworkLayer({ artwork }: { artwork: BannerArtwork }) {
  const style = {
    '--artwork-desktop-half': `${artwork.desktop.width / 2} / ${artwork.desktop.height}`,
    '--artwork-mobile-half': `${artwork.mobile.width / 2} / ${artwork.mobile.height}`,
  } as CSSProperties;
  const half =
    'absolute inset-y-0 aspect-(--artwork-mobile-half) max-w-1/2 overflow-hidden sm:aspect-(--artwork-desktop-half)';
  const halfImage = 'absolute inset-y-0 h-full w-auto max-w-none';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={style}
    >
      <ArtworkPicture
        artwork={artwork}
        className="absolute inset-0 size-full scale-125 object-cover blur-2xl"
      />
      <div
        className={cn(
          half,
          'left-0 [mask-image:linear-gradient(to_right,black_55%,transparent)]',
        )}
      >
        <ArtworkPicture artwork={artwork} className={cn(halfImage, 'left-0')} />
      </div>
      <div
        className={cn(
          half,
          'right-0 [mask-image:linear-gradient(to_left,black_55%,transparent)]',
        )}
      >
        <ArtworkPicture
          artwork={artwork}
          className={cn(halfImage, 'right-0')}
        />
      </div>
    </div>
  );
}

export function Banner({
  banner,
  inDashboard,
}: {
  banner: ResolvedBanner;
  inDashboard?: boolean;
}) {
  const countdownEndDate = banner.countdown?.enabled
    ? banner.countdown.endDate
    : undefined;
  const [isVisible, setIsVisible] = useState(inDashboard === true);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(
    null,
  );

  useEffect(() => {
    let isCancelled = false;

    // Fresh dashboard renders are server-filtered, but cached navigation can
    // restore stale banner props. Recheck cookies without hiding valid banners.
    setIsVisible(
      inDashboard === true && !isBannerCountdownExpired(countdownEndDate),
    );

    const resolveVisibility = async () => {
      if (!banner.dismissible) {
        return true;
      }

      const cookieValue = await getCookie(banner.dismiss.cookieKey);
      return !cookieValue;
    };

    resolveVisibility()
      .then((visible) => {
        const shouldShow =
          visible && !isBannerCountdownExpired(countdownEndDate);
        if (!(isCancelled || (inDashboard && shouldShow))) {
          setIsVisible(shouldShow);
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [
    banner.dismiss.cookieKey,
    banner.dismissible,
    countdownEndDate,
    inDashboard,
  ]);

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
        'relative isolate': banner.artwork,
      })}
      data-dashboard-banner={inDashboard ? '' : undefined}
      data-promo-theme={banner.theme}
    >
      {banner.artwork && <BannerArtworkLayer artwork={banner.artwork} />}
      <div
        className={cn(
          'relative mx-auto flex flex-col items-center gap-3 text-white',
          inDashboard
            ? 'justify-center gap-2 px-4 pt-3 pb-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-3 sm:px-14 sm:py-[clamp(0.375rem,1.5vw,1rem)]'
            : 'px-4 lg:container portrait:container sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4 lg:grid-cols-[1fr_2fr_1fr]',
        )}
        style={{
          paddingBlock: inDashboard ? undefined : 'clamp(0.5rem, 1.5vw, 1rem)',
        }}
      >
        <div
          className={cn(
            'flex min-w-0 flex-col items-center justify-center gap-3 text-center sm:flex-row sm:gap-6',
            inDashboard ? 'px-8 sm:px-0' : 'lg:col-start-2',
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
              : 'flex shrink-0 items-center justify-center gap-2 lg:col-start-3 lg:justify-self-end'
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
                  'absolute top-0 right-0 size-11 p-0 lg:top-1/2 lg:right-2 lg:-translate-y-1/2',
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
