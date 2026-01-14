'use client';

import { Loader2 } from 'lucide-react';
import { useActionState } from 'react';

import { createCheckoutSession } from '@/app/[lang]/actions/stripe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getTopupPackages } from '@/lib/stripe/pricing';
import type messages from '@/messages/en.json';

interface CreditTopupProps {
  dict: (typeof messages)['credits'];
  lang: Locale;
}

interface ActionState {
  error: string | null;
  success: boolean;
}

const initialState: ActionState = {
  error: null,
  success: false,
};

export function CreditTopup({ dict, lang }: CreditTopupProps) {
  const isPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';

  const { plans: pPlans } = dict;

  const TOPUP_PACKAGES = getTopupPackages(lang);

  const plans = [
    {
      id: 'starter',
      name: pPlans.starter.name,
      price: TOPUP_PACKAGES.starter.dollarAmount,
      isPopular: false,
      // pricePer1kCredits: TOPUP_PACKAGES.starter.pricePer1kCredits,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: pPlans.x_credits.replace(
        '__NUM_CREDITS__',
        TOPUP_PACKAGES.starter.baseCreditsLocale,
      ),
      promoBonus: TOPUP_PACKAGES.starter.promoBonus,
    },
    {
      id: 'standard',
      name: pPlans.standard.name,
      price: TOPUP_PACKAGES.standard.dollarAmount,
      isPopular: true,
      pricePer1kCredits: TOPUP_PACKAGES.standard.pricePer1kCredits,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: pPlans.x_credits.replace(
        '__NUM_CREDITS__',
        TOPUP_PACKAGES.standard.baseCreditsLocale,
      ),
      promoBonus: TOPUP_PACKAGES.standard.promoBonus,
    },
    {
      id: 'pro',
      name: pPlans.pro.name,
      price: TOPUP_PACKAGES.pro.dollarAmount,
      pricePer1kCredits: TOPUP_PACKAGES.pro.pricePer1kCredits,
      saveFromPrevPlanPer1kCredits: 0.333,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: pPlans.x_credits.replace(
        '__NUM_CREDITS__',
        TOPUP_PACKAGES.pro.baseCreditsLocale,
      ),
      promoBonus: TOPUP_PACKAGES.pro.promoBonus,
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
      {plans.map((plan) => (
        <CreditCard
          dict={dict}
          isPromoEnabled={isPromoEnabled}
          key={plan.id}
          plan={plan}
          pPlans={pPlans}
        />
      ))}
    </div>
  );
}

function CreditCard({
  plan,
  dict,
  isPromoEnabled,
  pPlans,
}: {
  plan: {
    id: string;
    name: string;
    price: number;
    isPopular?: boolean;
    pricePer1kCredits?: string;
    saveFromPrevPlanPer1kCredits?: number;
    buttonText: string;
    buttonVariant: string;
    creditsText: string;
    promoBonus?: string;
  };
  dict: (typeof messages)['credits'];
  isPromoEnabled: boolean;
  pPlans: (typeof messages)['credits']['plans'];
}) {
  const formAction = async (
    _prevState: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    try {
      const packageId = formData.get('packageId') as
        | 'starter'
        | 'standard'
        | 'pro';

      const { url } = await createCheckoutSession(formData, packageId);

      if (url) {
        window.location.assign(url);
        return { error: null, success: true };
      }

      throw new Error('No checkout URL received');
    } catch (error) {
      console.error('Error creating checkout session:', error);
      return {
        error: dict.status.checkoutError,
        success: false,
      };
    }
  };
  const [state, formActionDispatch, pending] = useActionState(
    formAction,
    initialState,
  );

  return (
    <Card
      className={`grid grid-rows-auto gap-2 p-6 ${plan.isPopular ? 'border-none ring-2 ring-pink-400' : ''} relative overflow-hidden`}
    >
      {isPromoEnabled && plan.price > 0 && (
        <div className="absolute top-0 right-0 rounded-bl-lg bg-gradient-to-br from-pink-500 to-pink-600 px-3 py-1 font-bold text-white text-xs">
          Black Friday Sale
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-xl">{plan.name}</h3>
          {!isPromoEnabled && plan.isPopular ? (
            <Badge className="rounded-full bg-pink-600">{pPlans.popular}</Badge>
          ) : (
            plan.price > 10 && (
              <Badge
                className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                variant="secondary"
              >
                20% cheaper
              </Badge>
            )
          )}
        </div>
        <div className="flex items-baseline">
          <span className="font-bold text-3xl">${plan.price}</span>
        </div>
        {!isPromoEnabled && plan.pricePer1kCredits ? (
          <div className="mt-1 text-muted-foreground text-xs">
            ${plan.pricePer1kCredits} per 1k credits{' '}
            {plan.saveFromPrevPlanPer1kCredits && (
              <span className="font-medium text-green-600 dark:text-green-400">
                (save ${plan.saveFromPrevPlanPer1kCredits}/1k credits)
              </span>
            )}
          </div>
        ) : (
          <div className="mt-1 text-muted-foreground text-xs">
            <br />
          </div>
        )}
      </div>

      <div className="font-medium text-sm">
        {plan.creditsText}{' '}
        {isPromoEnabled && plan.promoBonus && (
          <span className="font-semibold text-pink-600 dark:text-pink-400">
            (+{plan.promoBonus} bonus)
          </span>
        )}
      </div>

      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-red-600 text-xs">{state.error}</p>
        </div>
      )}

      <form action={formActionDispatch}>
        <input name="packageId" type="hidden" value={plan.id} />
        <input name="uiMode" type="hidden" value="hosted" />
        <Button
          className="my-4 w-full"
          disabled={pending}
          type="submit"
          variant={plan.buttonVariant as 'outline' | 'default'}
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {dict.topup.processing}
            </>
          ) : (
            dict.topup.buyCredits
          )}
        </Button>
      </form>
    </Card>
  );
}
