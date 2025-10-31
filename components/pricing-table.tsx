import { Check } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getTopupPackages } from '@/lib/stripe/pricing';

async function PricingTable({ lang }: { lang: Locale }) {
  const credits = await getDictionary(lang, 'credits');
  const { plans: pPlans, billing } = credits;

  const isPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';

  const TOPUP_PACKAGES = getTopupPackages(lang);

  const plans = [
    {
      name: pPlans.free.name,
      price: 0,
      billing: billing.forever,
      description: pPlans.free.description,
      buttonText: pPlans.startFree,
      buttonVariant: 'default',
      creditsText: pPlans.x_credits.replace(
        '__NUM_CREDITS__',
        TOPUP_PACKAGES.free.baseCreditsLocale,
      ),
      features: pPlans.free.features,
    },
    {
      name: pPlans.standard.name,
      price: TOPUP_PACKAGES.standard.dollarAmount,
      isPopular: true,
      pricePer1kCredits: TOPUP_PACKAGES.standard.pricePer1kCredits,
      description: pPlans.standard.description,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: pPlans.x_credits.replace(
        '__NUM_CREDITS__',
        TOPUP_PACKAGES.standard.baseCreditsLocale,
      ),
      promoBonus: TOPUP_PACKAGES.standard.promoBonus,
      features: pPlans.standard.features,
    },
    {
      name: pPlans.pro.name,
      price: TOPUP_PACKAGES.pro.dollarAmount,

      pricePer1kCredits: TOPUP_PACKAGES.pro.pricePer1kCredits,
      saveFromPrevPlanPer1kCredits: 0.333,
      description: pPlans.pro.description,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: pPlans.x_credits.replace(
        '__NUM_CREDITS__',
        TOPUP_PACKAGES.pro.baseCreditsLocale,
      ),
      promoBonus: TOPUP_PACKAGES.pro.promoBonus,
      features: pPlans.pro.features,
    },
  ];

  return (
    <div className="xl:px-28 py-16 flex flex-col gap-6">
      <h2 className="text-2xl font-semibold mb-4 mx-auto">
        {credits.pricingPlan}
      </h2>
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={`grid gap-2 grid-rows-[auto_minmax(60px,auto)_auto_1fr] p-6 ${plan.isPopular ? 'ring-orange-400 ring-2 border-none' : ''} relative overflow-hidden`}
            // className={`grid gap-2 grid-rows-[auto_minmax(60px,auto)_auto_1fr] p-6 ${plan.isPopular ? 'border-green-600' : ''}`}
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
                    {/*<Badge className="rounded-full bg-green-600">*/}
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
                <span className="text-sm text-muted-foreground">
                  {plan.billing}
                </span>
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
            <p className="text-sm text-muted-foreground">{plan.description}</p>
            <Button
              className="w-full my-4"
              asChild
              variant={plan.buttonVariant as 'outline' | 'default'}
            >
              <Link href={`/${lang}/signup`}>{plan.buttonText}</Link>
            </Button>
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {plan.creditsText}{' '}
                {isPromoEnabled && plan.promoBonus && (
                  <span className="text-orange-600 dark:text-orange-400 font-semibold">
                    (+{plan.promoBonus} bonus)
                  </span>
                )}
              </div>
              {plan.features.map((feature, i) => (
                <div key={i} className="flex items-center text-sm">
                  <Check className="mr-2 size-4 min-w-fit" />
                  {feature}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default PricingTable;
