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
  const translations = process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS || '';
  const bannerTranslations = (await getDictionary(lang, 'promos'))[
    translations as 'blackFridayBanner'
  ];
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

  const promoTheme = process.env.NEXT_PUBLIC_PROMO_THEME || 'pink'; // 'orange' or 'pink'

  return (
    <div
      className="flex flex-col gap-6 py-16 xl:px-28"
      data-promo-theme={promoTheme}
    >
      <h2 className="mx-auto mb-4 font-semibold text-2xl">
        {credits.pricingPlan}
      </h2>
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card
            className={`grid grid-rows-[auto_minmax(60px,auto)_auto_1fr] gap-2 p-6 ${plan.isPopular ? 'border-none ring-2 ring-promo-accent' : ''} relative overflow-hidden`}
            key={plan.name}
            // className={`grid gap-2 grid-rows-[auto_minmax(60px,auto)_auto_1fr] p-6 ${plan.isPopular ? 'border-green-600' : ''}`}
          >
            {isPromoEnabled && plan.price > 0 && (
              <div className="absolute top-0 right-0 rounded-bl-lg bg-gradient-to-br from-promo-primary to-promo-primary-dark px-3 py-1 font-bold text-white text-xs">
                {bannerTranslations.pricing.bannerText}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-xl">{plan.name}</h3>
                {!isPromoEnabled && plan.isPopular ? (
                  <Badge className="rounded-full bg-promo-text">
                    {/*<Badge className="rounded-full bg-green-600">*/}
                    {pPlans.popular}
                  </Badge>
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
                <span className="text-muted-foreground text-sm">
                  {plan.billing}
                </span>
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
            <p className="text-muted-foreground text-sm">{plan.description}</p>
            <Button
              asChild
              className="my-4 w-full"
              variant={plan.buttonVariant as 'outline' | 'default'}
            >
              <Link href={`/${lang}/signup`}>{plan.buttonText}</Link>
            </Button>
            <div className="space-y-2">
              <div className="font-medium text-sm">
                {plan.creditsText}{' '}
                {isPromoEnabled && plan.promoBonus && (
                  <span className="font-semibold text-promo-text-dark">
                    (+{plan.promoBonus} bonus)
                  </span>
                )}
              </div>
              {plan.features.map((feature, i) => (
                <div className="flex items-center text-sm" key={i}>
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
