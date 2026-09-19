'use client';

import { Loader2, Minus, Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { createCustomCheckoutSession } from '@/app/[lang]/actions/stripe';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CUSTOM_TOPUP_CREDIT_STEP,
  CUSTOM_TOPUP_MAX_CREDITS,
  CUSTOM_TOPUP_MIN_CREDITS,
  calculateCustomTopupDollarAmount,
  validateCustomCreditAmount,
} from '@/lib/stripe/pricing';

interface ActionState {
  error: string | null;
}

const initialState: ActionState = {
  error: null,
};

export function CustomTopup() {
  const t = useTranslations('credits.topup');
  const creditsT = useTranslations('credits');
  const format = useFormatter();
  // The raw field text is the source of truth while typing, so a half-typed
  // "12" isn't snapped up to the minimum on every keystroke. Everything we
  // show a price for goes through `validateCustomCreditAmount` first.
  const [inputValue, setInputValue] = useState(
    String(CUSTOM_TOPUP_MIN_CREDITS),
  );
  const credits = validateCustomCreditAmount(
    Number.parseInt(inputValue, 10) || 0,
  );

  const formAction = async (
    _prevState: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    try {
      const submittedCredits = validateCustomCreditAmount(
        Number.parseInt(String(formData.get('credits')), 10),
      );
      const { url } = await createCustomCheckoutSession(submittedCredits);

      if (url) {
        window.location.assign(url);
        return { error: null };
      }

      throw new Error('No checkout URL received');
    } catch (error) {
      console.error('Error creating custom checkout session:', error);
      return { error: creditsT('status.checkoutError') };
    }
  };

  const [state, formActionDispatch, pending] = useActionState(
    formAction,
    initialState,
  );

  const adjustCredits = (step: number) => {
    setInputValue(String(validateCustomCreditAmount(credits + step)));
  };

  return (
    <Card className="p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">{t('custom.title')}</CardTitle>
        <CardDescription>
          {t('custom.description', {
            minCredits: format.number(CUSTOM_TOPUP_MIN_CREDITS),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {state.error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-red-600 text-xs">{state.error}</p>
          </div>
        ) : null}
        <form
          action={formActionDispatch}
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="space-y-2">
            <Label htmlFor="custom-credits">{t('custom.creditsLabel')}</Label>
            <div className="flex items-center gap-2">
              <Button
                aria-label={t('custom.decrease')}
                disabled={credits <= CUSTOM_TOPUP_MIN_CREDITS}
                onClick={() => adjustCredits(-CUSTOM_TOPUP_CREDIT_STEP)}
                size="icon"
                type="button"
                variant="outline"
              >
                <Minus aria-hidden="true" className="size-4" />
              </Button>
              <Input
                className="w-32 text-center tabular-nums"
                id="custom-credits"
                inputMode="numeric"
                max={CUSTOM_TOPUP_MAX_CREDITS}
                min={CUSTOM_TOPUP_MIN_CREDITS}
                name="credits"
                onBlur={() => setInputValue(String(credits))}
                onChange={(event) => setInputValue(event.target.value)}
                step={CUSTOM_TOPUP_CREDIT_STEP}
                type="number"
                value={inputValue}
              />
              <Button
                aria-label={t('custom.increase')}
                disabled={credits >= CUSTOM_TOPUP_MAX_CREDITS}
                onClick={() => adjustCredits(CUSTOM_TOPUP_CREDIT_STEP)}
                size="icon"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('custom.hint', {
                step: format.number(CUSTOM_TOPUP_CREDIT_STEP),
              })}
            </p>
          </div>

          <div className="flex flex-1 flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-bold text-3xl tabular-nums">
                {format.number(calculateCustomTopupDollarAmount(credits), {
                  currency: 'USD',
                  style: 'currency',
                })}
              </div>
              <div className="text-muted-foreground text-sm tabular-nums">
                {t('custom.creditsSummary', {
                  credits: format.number(credits),
                })}
              </div>
            </div>
            <Button
              className="hit-area-6 w-full sm:w-auto"
              disabled={pending}
              size="lg"
              type="submit"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('processing')}
                </>
              ) : (
                t('buyCredits')
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
