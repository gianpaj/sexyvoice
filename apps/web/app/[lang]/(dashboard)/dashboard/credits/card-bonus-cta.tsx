'use client';

import { CreditCard, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { createCardBonusSetupSession } from '@/app/[lang]/actions/stripe';
import { Button } from '@/components/ui/button';

interface ActionState {
  alreadyClaimed: boolean;
  error: string | null;
}

const initialState: ActionState = {
  alreadyClaimed: false,
  error: null,
};

export function CardBonusCta() {
  const t = useTranslations('credits.cardBonus');
  const { lang } = useParams();

  const formAction = async (_prevState: ActionState): Promise<ActionState> => {
    try {
      const { alreadyClaimed, url } = await createCardBonusSetupSession({
        lang,
      });

      if (alreadyClaimed) {
        return { alreadyClaimed: true, error: null };
      }

      if (url) {
        window.location.assign(url);
        return { alreadyClaimed: false, error: null };
      }

      throw new Error('No setup session URL received');
    } catch (error) {
      console.error('Error creating card bonus setup session:', error);
      return {
        alreadyClaimed: false,
        error: t('error'),
      };
    }
  };

  const [state, formActionDispatch, pending] = useActionState(
    formAction,
    initialState,
  );

  if (state.alreadyClaimed) {
    return null;
  }

  return (
    <div className="flex flex-col justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <CreditCard className="size-5 shrink-0 text-primary" />
        <div>
          <h4 className="font-semibold text-sm">{t('title')}</h4>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
          {state.error ? (
            <p className="mt-1 text-red-600 text-xs">{state.error}</p>
          ) : null}
        </div>
      </div>
      <form action={formActionDispatch}>
        <Button
          className="hit-area-6 w-full sm:w-auto"
          disabled={pending}
          type="submit"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('processing')}
            </>
          ) : (
            t('cta')
          )}
        </Button>
      </form>
    </div>
  );
}
