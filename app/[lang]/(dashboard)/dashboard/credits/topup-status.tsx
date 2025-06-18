'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CircleCheckIcon, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface TopupStatusProps {
  dict: any; // Replace with proper type when available
}

export function TopupStatus({ dict }: TopupStatusProps) {
  const searchParams = useSearchParams();
  const [isVisible, setIsVisible] = useState(false);
  const [status, setStatus] = useState<'success' | 'error' | 'canceled' | null>(
    null,
  );
  const [amount, setAmount] = useState<string | null>(null);

  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    const error = searchParams.get('error');
    const creditAmount = searchParams.get('amount');

    if (success === 'true') {
      setStatus('success');
      setAmount(creditAmount);
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
      }, 10000);

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

  if (!isVisible || !status) {
    return null;
  }

  return (
    <div className="mb-6 w-full lg:w-1/2">
      {status === 'success' && (
        <Alert className="grid grid-cols-subgrid gap-2">
          <div className="grid grid-cols-[auto,1fr,auto] gap-2 items-center">
            <CircleCheckIcon
              className="me-3 -mt-0.5 inline-flex !text-emerald-500"
              aria-hidden="true"
            />

            <AlertTitle>Payment Successful!</AlertTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              className="border-green-300 hover:bg-green-900"
            >
              Dismiss
            </Button>
          </div>
          <div className="grid grid-cols-[2fr,1fr,auto]">
            <AlertDescription className="text-muted-foreground">
              {amount
                ? `Your account has been credited with ${Number(amount).toLocaleString()} credits.`
                : 'Your credits have been successfully added to your account.'}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {status === 'canceled' && (
        <Alert className="border-yellow-200 bg-yellow-50 text-yellow-800">
          <XCircle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Payment Canceled</AlertTitle>
          <AlertDescription className="text-yellow-700">
            Your payment was canceled. No charges were made to your account.
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismiss}
                className="border-yellow-300 text-yellow-700 hover:bg-yellow-100"
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {status === 'error' && (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Payment Failed</AlertTitle>
          <AlertDescription className="text-red-700">
            There was an issue processing your payment. Please try again or
            contact support if the problem persists.
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismiss}
                className="border-red-300 text-red-700 hover:bg-red-100"
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
