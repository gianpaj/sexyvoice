'use client';

import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from '@/lib/i18n/navigation';
import {
  PRO_TOPUP_DISCOUNT_VS_STANDARD,
  SUBSCRIPTION_BONUS_MULTIPLIER,
} from '@/lib/stripe/pricing';
import { cn } from '@/lib/utils';

export type BillingMode = 'monthly' | 'one-time';

export interface PlanData {
  billing?: string;
  buttonText: string;
  buttonVariant: string;
  creditsText: string;
  description: string;
  features: string[];
  isPopular?: boolean;
  name: string;
  price: number;
  pricePer1kCredits?: string;
  promoBonus?: string;
  saveFromPrevPlanPer1kCredits?: number;
  /** Only present on subscription plans */
  subscriptionBonusCredits?: string;
}

interface PricingCardsProps {
  className?: string;
  disableSubscriptionToggle?: boolean;
  isPromoEnabled: boolean;
  promoBannerText?: string;
  promoTheme: string;
  subscriptionPlans: PlanData[];
  topupPlans: PlanData[];
}

export function PricingCards({
  className,
  disableSubscriptionToggle = false,
  isPromoEnabled,
  promoBannerText,
  promoTheme,
  subscriptionPlans,
  topupPlans,
}: PricingCardsProps) {
  const t = useTranslations('credits.plans');
  const billingT = useTranslations('credits.billing');
  const creditsT = useTranslations('credits');
  const format = useFormatter();
  const [billingMode, setBillingMode] = useState<BillingMode>('monthly');

  const plans =
    billingMode === 'monthly' && !disableSubscriptionToggle
      ? subscriptionPlans
      : topupPlans;

  return (
    <div
      className={cn('flex flex-col gap-6 xl:px-28', className)}
      data-promo-theme={promoTheme}
    >
      {/* Billing toggle — the "+15%" badge here is the single source of truth */}
      <div className="mx-auto flex items-center gap-1 rounded-full bg-muted p-1">
        <button
          aria-disabled={disableSubscriptionToggle}
          aria-pressed={billingMode === 'monthly' && !disableSubscriptionToggle}
          className={`hit-area-2 rounded-full px-4 py-1.5 font-medium text-sm transition-colors ${
            billingMode === 'monthly' && !disableSubscriptionToggle
              ? 'bg-primary text-primary-foreground shadow-sm'
              : disableSubscriptionToggle
                ? 'cursor-not-allowed text-muted-foreground opacity-50'
                : 'text-muted-foreground hover:text-foreground'
          }`}
          disabled={disableSubscriptionToggle}
          onClick={() => setBillingMode('monthly')}
          type="button"
        >
          {t('toggleMonthly')}
          <span className="ml-1.5 rounded-full bg-promo-accent/20 px-1.5 py-0.5 font-semibold text-promo-accent text-xs">
            +{Math.round((SUBSCRIPTION_BONUS_MULTIPLIER - 1) * 100)}%
          </span>
        </button>
        <button
          aria-pressed={billingMode === 'one-time' || disableSubscriptionToggle}
          className={`hit-area-2 rounded-full px-4 py-1.5 font-medium text-sm transition-colors ${
            billingMode === 'one-time' || disableSubscriptionToggle
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setBillingMode('one-time')}
          type="button"
        >
          {t('toggleOneTime')}
        </button>
      </div>

      <div
        className={clsx('grid gap-6', {
          'md:grid-cols-1 lg:grid-cols-3': plans.length === 3,
          'md:grid-cols-2 lg:grid-cols-4': plans.length === 4,
        })}
      >
        {plans.map((plan) => (
          <Card
            className={`relative overflow-hidden p-6 ${plan.isPopular ? 'border-none ring-2 ring-promo-accent' : ''} grid grid-rows-[auto_minmax(60px,auto)_auto_1fr] gap-2`}
            key={`${plan.name}-${billingMode}`}
          >
            {/* Promo corner badge — only during active promotions */}
            {isPromoEnabled && plan.price > 0 && promoBannerText && (
              <div className="absolute top-0 right-0 rounded-bl-lg bg-linear-to-br from-promo-primary to-promo-primary-dark px-3 py-1 font-bold text-white text-xs">
                {promoBannerText}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-xl">{plan.name}</h3>
                {!isPromoEnabled && plan.isPopular && (
                  <Badge className="rounded-full bg-promo-text">
                    {t('popular')}
                  </Badge>
                )}
                {!(isPromoEnabled || plan.isPopular) && plan.price > 10 && (
                  <Badge
                    className="bg-green-900 text-green-100"
                    variant="secondary"
                  >
                    {creditsT('topup.cheaperBadge', {
                      percent: format.number(PRO_TOPUP_DISCOUNT_VS_STANDARD, {
                        style: 'percent',
                        maximumFractionDigits: 1,
                      }),
                    })}
                  </Badge>
                )}
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="font-bold text-3xl tabular-nums">
                  ${plan.price}
                </span>
                <span className="text-muted-foreground text-sm">
                  {plan.billing ??
                    (billingMode === 'monthly'
                      ? billingT('monthly')
                      : billingT('oneTime'))}
                </span>
              </div>
              {!isPromoEnabled && plan.pricePer1kCredits ? (
                <div className="mt-1 text-muted-foreground text-xs tabular-nums">
                  ${plan.pricePer1kCredits} per 1k credits
                  {plan.saveFromPrevPlanPer1kCredits && (
                    <>
                      {' '}
                      <span className="font-medium text-green-400">
                        (save ${plan.saveFromPrevPlanPer1kCredits}/1k)
                      </span>
                    </>
                  )}
                </div>
              ) : (
                /* Keep vertical rhythm consistent across cards */
                <div className="mt-1 h-4" />
              )}
            </div>
            <p className="text-muted-foreground text-sm">{plan.description}</p>
            <Button
              asChild
              className="hit-area-6 my-4 w-full"
              variant={plan.buttonVariant as 'outline' | 'default'}
            >
              <Link href="/signup">{plan.buttonText}</Link>
            </Button>
            <div className="space-y-2">
              <div>
                <div className="font-semibold text-base tabular-nums">
                  {plan.creditsText}
                </div>
                {isPromoEnabled && plan.promoBonus && (
                  <div className="font-medium text-promo-text-dark text-xs">
                    +{plan.promoBonus} bonus
                  </div>
                )}
                {billingMode === 'monthly' && plan.subscriptionBonusCredits && (
                  <div className="font-medium text-green-400 text-xs">
                    {t('subscriptionBonusCredits', {
                      bonusCredits: plan.subscriptionBonusCredits,
                    })}
                  </div>
                )}
              </div>
              {plan.features.map((feature, index) => (
                <div className="flex items-center text-sm" key={index}>
                  <Check aria-hidden="true" className="mr-2 size-4 min-w-fit" />
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
