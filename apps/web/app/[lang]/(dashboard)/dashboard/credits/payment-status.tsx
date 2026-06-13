'use client';

import { CircleCheckIcon, XCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function PaymentStatus() {
  const t = useTranslations('credits.status');
  const searchParams = useSearchParams();
  const creditsAmount = searchParams.get('creditsAmount');

  const success = searchParams.get('success');
  const canceled = searchParams.get('canceled');
  const error = searchParams.get('error');

  const status: 'success' | 'canceled' | 'error' | null =
    success === 'true' ? 'success'
    : canceled === 'true' ? 'canceled'
    : error ? 'error'
    : null;

  const [isVisible, setIsVisible] = useState(() => status !== null);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setIsVisible(false), 10_000);
    return () => clearTimeout(timer);
  }, [status]);

  const handleDismiss = () => {
    setIsVisible(false);
    // Clean up URL parameters
    const url = new URL(window.location.href);
    url.searchParams.delete('success');
    url.searchParams.delete('canceled');
    url.searchParams.delete('error');
    url.searchParams.delete('amount');
    window.history.replaceState({}, '', url.toString());
  };

  if (!(isVisible && status)) {
    return null;
  }

  return (
    <div className="mb-6 w-full lg:w-1/2">
      {status === 'success' && (
        <Alert className="">
          <CircleCheckIcon
            aria-hidden="true"
            className="me-3 -mt-0.5 h-4 w-4 text-emerald-500!"
          />

          <AlertTitle>{t('success.title')}</AlertTitle>

          <AlertDescription className="text-muted-foreground">
            {creditsAmount
              ? t('success.descriptionWithAmount', { creditsAmount })
              : t('success.description')}
            <div className="mt-2">
              <Button
                className="border-green-300 hover:bg-green-900"
                onClick={handleDismiss}
                size="sm"
                variant="outline"
              >
                {t('success.dismiss')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {status === 'canceled' && (
        <Alert className="border-amber-900 bg-amber-950 text-amber-50">
          <XCircle className="h-4 w-4" />
          <AlertTitle>{t('canceled.title')}</AlertTitle>
          <AlertDescription>
            {t('canceled.description')}
            <div className="mt-2">
              <Button
                className="hover:bg-secondary/50"
                onClick={handleDismiss}
                size="sm"
                variant="secondary"
              >
                {t('canceled.dismiss')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {status === 'error' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>{t('error.title')}</AlertTitle>
          <AlertDescription>
            {t('error.description')}
            <div className="mt-2">
              <Button onClick={handleDismiss} size="sm" variant="secondary">
                {t('error.dismiss')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
