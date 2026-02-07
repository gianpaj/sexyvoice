'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface PlanData {
  name: string;
  oneTimePrice: number;
  monthlyPrice: number;
  billing?: string;
  isPopular?: boolean;
  pricePer1kCredits?: string;
  saveFromPrevPlanPer1kCredits?: number;
  description: string;
  buttonText: string;
  buttonVariant: string;
  creditsText: string;
  promoBonus?: string;
  features: string[];
}

interface BillingStrings {
  oneTime: string;
  monthly: string;
  monthlyDiscount: string;
  perMonth: string;
}

interface PricingCardsProps {
  plans: PlanData[];
  billing: BillingStrings;
  popularLabel: string;
  lang: string;
  isPromoEnabled: boolean;
  promoTheme: string;
  promoBannerText?: string;
}

export function PricingCards({
  plans,
  billing,
  popularLabel,
  lang,
  isPromoEnabled,
  promoTheme,
  promoBannerText,
}: PricingCardsProps) {
  const [billingMode, setBillingMode] = useState<'one-time' | 'monthly'>(
    'one-time',
  );
  const isMonthly = billingMode === 'monthly';

  return (
    <div className="flex flex-col gap-6 py-16 xl:px-28" data-promo-theme={promoTheme}>
      <h2 className="mx-auto mb-4 font-semibold text-2xl">Pricing</h2>

      {/* Billing toggle */}
      <div className="mx-auto flex items-center gap-2 rounded-lg bg-muted p-1">
        <button
          type="button"
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
            !isMonthly
              ? 'bg-background text-foreground shadow'
              : 'text-muted-foreground'
          }`}
          onClick={() => setBillingMode('one-time')}
        >
          {billing.oneTime}
        </button>
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
            isMonthly
              ? 'bg-background text-foreground shadow'
              : 'text-muted-foreground'
          }`}
          onClick={() => setBillingMode('monthly')}
        >
          {billing.monthly}
          <span className="rounded-full bg-green-900 px-2 py-0.5 text-[10px] font-semibold text-green-100">
            {billing.monthlyDiscount}
          </span>
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {plans.map((plan) => {
          const isPaid = plan.oneTimePrice > 0;
          const displayPrice = isPaid && isMonthly ? plan.monthlyPrice : plan.oneTimePrice;
          const displayPriceFormatted = Number.isInteger(displayPrice)
            ? displayPrice
            : displayPrice.toFixed(2);

          return (
            <Card
              className={`grid grid-rows-[auto_minmax(60px,auto)_auto_1fr] gap-2 p-6 ${plan.isPopular ? 'border-none ring-2 ring-promo-accent' : ''} relative overflow-hidden`}
              key={plan.name}
            >
              {isPromoEnabled && isPaid && (
                <div className="absolute top-0 right-0 rounded-bl-lg bg-gradient-to-br from-promo-primary to-promo-primary-dark px-3 py-1 font-bold text-white text-xs">
                  {promoBannerText}
                </div>
              )}
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-xl">{plan.name}</h3>
                  {!isPromoEnabled && plan.isPopular && (
                    <Badge className="rounded-full bg-promo-text">
                      {popularLabel}
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline">
                  <span className="font-bold text-3xl">
                    ${displayPriceFormatted}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {isPaid && isMonthly ? billing.perMonth : plan.billing}
                  </span>
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
          );
        })}
      </div>
    </div>
  );
}
