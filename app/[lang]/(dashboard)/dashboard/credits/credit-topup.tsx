'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { createCheckoutSession } from '@/app/[lang]/actions/stripe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getTopupPackages } from '@/lib/stripe/pricing';
import type messages from '@/messages/en.json';

interface CreditTopupProps {
  dict: Pick<typeof messages, 'credits' | 'promos'>;
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
  const t = useTranslations('credits.plans');
  const promoTheme = process.env.NEXT_PUBLIC_PROMO_THEME || 'pink';
  const isPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';
  const translations = process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS || '';
  const bannerTranslations = Object.hasOwn(dict.promos, translations)
    ? dict.promos[translations as keyof typeof dict.promos]
    : undefined;

  const { plans: pPlans } = dict.credits;
  const topupPackages = getTopupPackages(lang);

  const plans = [
    {
      id: 'starter',
      name: pPlans.starter.name,
      price: topupPackages.starter.dollarAmount,
      buttonVariant: 'default',
      creditsText: t('x_credits', {
        numCredits: topupPackages.starter.baseCreditsLocale,
      }),
      promoBonus: topupPackages.starter.promoBonus,
    },
    {
      id: 'standard',
      name: pPlans.standard.name,
      price: topupPackages.standard.dollarAmount,
      isPopular: true,
      pricePer1kCredits: topupPackages.standard.pricePer1kCredits,
      buttonVariant: 'default',
      creditsText: t('x_credits', {
        numCredits: topupPackages.standard.baseCreditsLocale,
      }),
      promoBonus: topupPackages.standard.promoBonus,
    },
    {
      id: 'pro',
      name: pPlans.pro.name,
      price: topupPackages.pro.dollarAmount,
      pricePer1kCredits: topupPackages.pro.pricePer1kCredits,
      saveFromPrevPlanPer1kCredits: 0.15,
      buttonVariant: 'default',
      creditsText: t('x_credits', {
        numCredits: topupPackages.pro.baseCreditsLocale,
      }),
      promoBonus: topupPackages.pro.promoBonus,
    },
  ];

  return (
    <div
      className="grid gap-6 md:grid-cols-1 lg:grid-cols-3"
      data-promo-theme={promoTheme}
    >
      {plans.map((plan) => (
        <PlanCard
          bannerTranslations={bannerTranslations}
          creditsDict={dict.credits}
          isPromoEnabled={isPromoEnabled}
          key={plan.id}
          plan={plan}
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  creditsDict,
  bannerTranslations,
  isPromoEnabled,
}: {
  plan: {
    id: string;
    name: string;
    price: number;
    isPopular?: boolean;
    pricePer1kCredits?: string;
    saveFromPrevPlanPer1kCredits?: number;
    buttonVariant: string;
    creditsText: string;
    promoBonus?: string;
  };
  creditsDict: typeof messages.credits;
  isPromoEnabled: boolean;
  bannerTranslations?: (typeof messages.promos)[keyof typeof messages.promos];
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
        error: creditsDict.status.checkoutError,
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
      className={`relative overflow-hidden p-6 ${plan.isPopular ? 'border-none ring-2 ring-promo-accent' : ''} grid grid-rows-auto gap-2`}
    >
      {isPromoEnabled && plan.price > 0 && (
        <div className="absolute top-0 right-0 rounded-bl-lg bg-gradient-to-br from-promo-primary to-promo-primary-dark px-3 py-1 font-bold text-white text-xs">
          {bannerTranslations?.pricing.bannerText}
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-xl">{plan.name}</h3>
          {!isPromoEnabled && plan.isPopular ? (
            <Badge className="rounded-full bg-promo-text">
              {creditsDict.plans.popular}
            </Badge>
          ) : (
            plan.price > 10 && (
              <Badge
                className="bg-green-900 text-green-100"
                variant="secondary"
              >
                37.5% cheaper
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
              <span className="font-medium text-green-400">
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
          <span className="font-semibold text-promo-text-dark">
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
              {creditsDict.topup.processing}
            </>
          ) : (
            creditsDict.topup.buyCredits
          )}
        </Button>
      </form>
    </Card>
  );
}
