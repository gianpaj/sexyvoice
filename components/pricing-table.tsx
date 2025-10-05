import { Check } from 'lucide-react';
import Link from 'next/link';

import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Button } from './ui/button';
import { Card } from './ui/card';

async function PricingTable({ lang }: { lang: Locale }) {
  const credits = await getDictionary(lang, 'credits');
  const { plans: pPlans } = credits;

  // Check if Halloween promo is active
  const isHalloweenActive =
    process.env.NEXT_PUBLIC_HALLOWEEN_PROMO_ENABLED === 'true';

  const plans = [
    {
      name: pPlans.free.name,
      price: '0',
      billing: credits.billing.forever,
      description: pPlans.free.description,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      credits: pPlans.free.credits,
      features: pPlans.free.features,
    },
    {
      name: pPlans.starter.name,
      price: '10',
      isPopular: true,

      description: pPlans.starter.description,
      buttonText: isHalloweenActive
        ? `${pPlans.buyCredits} 🎃`
        : pPlans.buyCredits,
      buttonVariant: 'default',
      credits: isHalloweenActive
        ? // FIXME
          '30,000 credits (~30 min of audio) 🎃'
        : pPlans.starter.credits,
      features: pPlans.starter.features,
    },
    {
      name: pPlans.pro.name,
      price: '99',

      description: pPlans.pro.description,
      buttonText: isHalloweenActive
        ? `${pPlans.buyCredits} 🎃`
        : pPlans.buyCredits,
      buttonVariant: 'default',
      credits: isHalloweenActive
        ? '235,000 credits (~235 minutes of audio) 🎃'
        : pPlans.pro.credits,
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
            className={`grid gap-2 grid-rows-[auto_minmax(60px,auto)_auto_1fr] p-6 ${plan.isPopular ? 'border-orange-400' : ''}`}
            // className={`grid gap-2 grid-rows-[auto_minmax(60px,auto)_auto_1fr] p-6 ${plan.isPopular ? 'border-green-600' : ''}`}
          >
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                {plan.isPopular && (
                  <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs text-white">
                    {/*<span className="rounded-full bg-green-800 px-2 py-0.5 text-xs text-white">*/}
                    {pPlans.popular}
                  </span>
                )}
              </div>
              <div className="flex items-baseline">
                <span className="text-3xl font-bold">${plan.price}</span>
                <span className="text-sm text-muted-foreground">
                  {plan.billing}
                </span>
              </div>
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
              <div className="text-sm font-medium">{plan.credits}</div>
              {/* @ts-ignore */}
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
