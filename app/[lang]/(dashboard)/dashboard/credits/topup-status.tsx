'use client';

import { CircleCheckIcon, XCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type lang from '@/lib/i18n/dictionaries/en.json';

interface TopupStatusProps {
  dict: (typeof lang)['credits'];
}

export function TopupStatus({ dict }: TopupStatusProps) {
  const searchParams = useSearchParams();
  const [isVisible, setIsVisible] = useState(false);
  const [status, setStatus] = useState<'success' | 'error' | 'canceled' | null>(
    null,
  );
  const creditsAmount = searchParams.get('creditsAmount');

  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    const error = searchParams.get('error');

    if (success === 'true') {
      setStatus('success');
      setIsVisible(true);
    } else if (canceled === 'true') {
      setStatus('canceled');
      setIsVisible(true);
    } else if (error) {
      setStatus('error');
      setIsVisible(true);
    }

    // Auto-hide after 10 seconds
    if (success || canceled || error) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 10_000);

      return () => clearTimeout(timer);
    }
  }, [searchParams]);

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
        <Alert className="grid grid-cols-subgrid gap-2">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
            <CircleCheckIcon
              aria-hidden="true"
              className="!text-emerald-500 me-3 -mt-0.5 inline-flex"
            />

            <AlertTitle>{dict.status.success.title}</AlertTitle>
            <Button
              className="border-green-300 hover:bg-green-900"
              onClick={handleDismiss}
              size="sm"
              variant="outline"
            >
              {dict.status.success.dismiss}
            </Button>
          </div>
          <div className="grid grid-cols-[2fr,1fr,auto]">
            <AlertDescription className="text-muted-foreground">
              {creditsAmount
                ? dict.status.success.descriptionWithAmount.replace(
                    '{creditsAmount}',
                    Number(creditsAmount).toLocaleString(),
                  )
                : dict.status.success.description}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {status === 'canceled' && (
        <Alert className="border-yellow-200 bg-yellow-50 text-yellow-800">
          <XCircle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">
            {dict.status.canceled.title}
          </AlertTitle>
          <AlertDescription className="text-yellow-700">
            {dict.status.canceled.description}
            <div className="mt-2">
              <Button
                className="border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                onClick={handleDismiss}
                size="sm"
                variant="outline"
              >
                {dict.status.canceled.dismiss}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {status === 'error' && (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">
            {dict.status.error.title}
          </AlertTitle>
          <AlertDescription className="text-red-700">
            {dict.status.error.description}
            <div className="mt-2">
              <Button
                className="border-red-300 text-red-700 hover:bg-red-100"
                onClick={handleDismiss}
                size="sm"
                variant="outline"
              >
                {dict.status.error.dismiss}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
