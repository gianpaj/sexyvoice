'use client';

import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { useRouter } from '@/lib/i18n/navigation';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';

export function CreditBalanceError() {
  const t = useTranslations('creditsSection');
  const router = useRouter();
  const queryClient = useQueryClient();
  const isRetrying = useIsFetching({ queryKey: ['credits'] }) > 0;
  const [isPending, startTransition] = useTransition();

  return (
    <Alert data-testid="credits-balance-error" variant="destructive">
      <AlertDescription>
        {t('balanceError')}
        <div className="mt-2">
          <Button
            disabled={isRetrying || isPending}
            onClick={() => {
              startTransition(() => {
                queryClient.invalidateQueries({ queryKey: ['credits'] });
                router.refresh();
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
