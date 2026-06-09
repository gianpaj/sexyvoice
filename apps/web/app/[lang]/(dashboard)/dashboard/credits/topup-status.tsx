'use client';

import { CircleCheckIcon, XCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type messages from '@/messages/en.json';

interface TopupStatusProps {
  dict: (typeof messages)['credits'];
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
        <Alert className="">
          <CircleCheckIcon
            aria-hidden="true"
            className="me-3 -mt-0.5 h-4 w-4 text-emerald-500!"
          />

          <AlertTitle>{dict.status.success.title}</AlertTitle>

          <AlertDescription className="text-muted-foreground">
            {creditsAmount
              ? dict.status.success.descriptionWithAmount.replace(
                  '{creditsAmount}',
                  Number(creditsAmount).toLocaleString(),
                )
              : dict.status.success.description}
            <div className="mt-2">
              <Button
                className="border-green-300 hover:bg-green-900"
                onClick={handleDismiss}
                size="sm"
                variant="outline"
              >
                {dict.status.success.dismiss}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {status === 'canceled' && (
        <Alert className="border-amber-900 bg-amber-950 text-amber-50">
          <XCircle className="h-4 w-4" />
          <AlertTitle>{dict.status.canceled.title}</AlertTitle>
          <AlertDescription>
            {dict.status.canceled.description}
            <div className="mt-2">
              <Button
                className="hover:bg-secondary/50"
                onClick={handleDismiss}
                size="sm"
                variant="secondary"
              >
                {dict.status.canceled.dismiss}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {status === 'error' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>{dict.status.error.title}</AlertTitle>
          <AlertDescription>
            {dict.status.error.description}
            <div className="mt-2">
              <Button onClick={handleDismiss} size="sm" variant="secondary">
                {dict.status.error.dismiss}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
