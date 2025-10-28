'use client';

import { Loader2 } from 'lucide-react';
import { useActionState } from 'react';

import { createCheckoutSession } from '@/app/[lang]/actions/stripe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type lang from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getTopupPackages } from '@/lib/stripe/pricing';

interface CreditTopupProps {
  dict: (typeof lang)['credits'];
  lang: Locale;
}

type ActionState = {
  error: string | null;
  success: boolean;
};

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
          key={plan.id}
          plan={plan}
          dict={dict}
          isPromoEnabled={isPromoEnabled}
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
  dict: (typeof lang)['credits'];
  isPromoEnabled: boolean;
  pPlans: (typeof lang)['credits']['plans'];
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
      className={`grid gap-2 grid-rows-auto p-6 ${plan.isPopular ? 'ring-orange-400 ring-2 border-none' : ''} relative overflow-hidden`}
    >
      {isPromoEnabled && plan.price > 0 && (
        <div className="absolute top-0 right-0 bg-gradient-to-br from-orange-500 to-orange-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
          🎃 Halloween Special
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">{plan.name}</h3>
          {!isPromoEnabled && plan.isPopular ? (
            <Badge className="rounded-full bg-orange-600">
              {pPlans.popular}
            </Badge>
          ) : (
            plan.price > 10 && (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
              >
                20% cheaper
              </Badge>
            )
          )}
        </div>
        <div className="flex items-baseline">
          <span className="text-3xl font-bold">${plan.price}</span>
        </div>
        {!isPromoEnabled && plan.pricePer1kCredits ? (
          <div className="mt-1 text-xs text-muted-foreground">
            ${plan.pricePer1kCredits} per 1k credits{' '}
            {plan.saveFromPrevPlanPer1kCredits && (
              <span className="text-green-600 dark:text-green-400 font-medium">
                (save ${plan.saveFromPrevPlanPer1kCredits}/1k credits)
              </span>
            )}
          </div>
        ) : (
          <div className="mt-1 text-xs text-muted-foreground">
            <br />
          </div>
        )}
      </div>

      <div className="text-sm font-medium">
        {plan.creditsText}{' '}
        {isPromoEnabled && plan.promoBonus && (
          <span className="text-orange-600 dark:text-orange-400 font-semibold">
            (+{plan.promoBonus} bonus)
          </span>
        )}
      </div>

      {state.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-xs">{state.error}</p>
        </div>
      )}

      <form action={formActionDispatch}>
        <input type="hidden" name="packageId" value={plan.id} />
        <input type="hidden" name="uiMode" value="hosted" />
        <Button
          type="submit"
          className="w-full my-4"
          variant={plan.buttonVariant as 'outline' | 'default'}
          disabled={pending}
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
