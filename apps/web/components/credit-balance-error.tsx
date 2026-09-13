'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { useRouter } from '@/lib/i18n/navigation';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';

export function CreditBalanceError({
  onRetry,
  isRetrying = false,
}: {
  onRetry?: () => Promise<unknown>;
  isRetrying?: boolean;
}) {
  const t = useTranslations('creditsSection');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Alert variant="destructive">
      <AlertDescription>
        {t('balanceError')}
        <div className="mt-2">
          <Button
            disabled={isRetrying || isPending}
            onClick={() => {
              startTransition(async () => {
                if (onRetry) {
                  await onRetry();
                } else {
                  router.refresh();
                }
              });
            }}
            size="sm"
            variant="outline"
          >
            {t('retryBalance')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
