import { createTranslator } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { type PlanData, PricingCards } from '@/components/pricing-cards';
import type { Locale } from '@/lib/i18n/i18n-config';
import {
  getSubscriptionPackages,
  getTopupPackages,
} from '@/lib/stripe/pricing';

async function PricingTable({
  className,
  hideFreePlan = false,
  lang,
  shouldShowSubscriptionPlans = true,
}: {
  className?: string;
  hideFreePlan?: boolean;
  lang: Locale;
  shouldShowSubscriptionPlans?: boolean;
}) {
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const { credits, promos } = messages;
  const plansT = createTranslator({
    locale: lang,
    messages,
    namespace: 'credits.plans',
  });

  const translations = process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS;
  const bannerTranslations =
    translations && Object.hasOwn(promos, translations)
      ? promos[translations as keyof typeof promos]
      : undefined;

  const { plans: pPlans, billing } = credits;
  const isPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';
  const topupPackages = getTopupPackages(lang);
  const subscriptionPackages = getSubscriptionPackages(lang);

  // Free plan is the same regardless of billing mode
  const freePlan: PlanData = {
    name: pPlans.free.name,
    price: 0,
    billing: billing.forever,
    description: pPlans.free.description,
    buttonText: pPlans.startFree,
    buttonVariant: 'default',
    creditsText: plansT('x_credits', {
      numCredits: topupPackages.free.baseCreditsLocale,
    }),
    features: pPlans.free.features,
  };

  // --- Top-up (one-time) plans ---
  const topupPlans: PlanData[] = [
    ...(hideFreePlan ? [] : [freePlan]),
    {
      name: pPlans.starter.name,
      price: topupPackages.starter.dollarAmount,
      pricePer1kCredits: (
        (topupPackages.starter.dollarAmount /
          topupPackages.starter.baseCredits) *
        1000
      ).toFixed(2),
      description: pPlans.starter.description,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: plansT('x_credits', {
        numCredits: topupPackages.starter.baseCreditsLocale,
      }),
      promoBonus: topupPackages.starter.promoBonus,
      features: pPlans.starter.features,
    },
    {
      name: pPlans.standard.name,
      price: topupPackages.standard.dollarAmount,
      isPopular: true,
      pricePer1kCredits: topupPackages.standard.pricePer1kCredits,
      saveFromPrevPlanPer1kCredits: hideFreePlan
        ? Number(
            (
              (topupPackages.starter.dollarAmount /
                topupPackages.starter.baseCredits) *
                1000 -
              Number(topupPackages.standard.pricePer1kCredits)
            ).toFixed(2),
          )
        : undefined,
      description: pPlans.standard.description,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: plansT('x_credits', {
        numCredits: topupPackages.standard.baseCreditsLocale,
      }),
      promoBonus: topupPackages.standard.promoBonus,
      features: pPlans.standard.features,
    },
    {
      name: pPlans.pro.name,
      price: topupPackages.pro.dollarAmount,
      pricePer1kCredits: topupPackages.pro.pricePer1kCredits,
      saveFromPrevPlanPer1kCredits: Number(
        (
          Number(topupPackages.standard.pricePer1kCredits) -
          Number(topupPackages.pro.pricePer1kCredits)
        ).toFixed(2),
      ),
      description: pPlans.pro.description,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: plansT('x_credits', {
        numCredits: topupPackages.pro.baseCreditsLocale,
      }),
      promoBonus: topupPackages.pro.promoBonus,
      features: pPlans.pro.features,
    },
  ];

  // --- Subscription (monthly) plans with 15% bonus ---
  const subscriptionPlans: PlanData[] = [
    ...(hideFreePlan ? [] : [freePlan]),
    {
      name: pPlans.starter.name,
      price: subscriptionPackages.starter.dollarAmount,
      pricePer1kCredits: (
        (subscriptionPackages.starter.dollarAmount /
          subscriptionPackages.starter.baseCredits) *
        1000
      ).toFixed(2),
      description: pPlans.starter.description,
      buttonText: pPlans.subscribe,
      buttonVariant: 'default',
      creditsText: plansT('x_credits', {
        numCredits: subscriptionPackages.starter.baseCreditsLocale,
      }),
      subscriptionBonusCredits: (
        subscriptionPackages.starter.credits -
        subscriptionPackages.starter.baseCredits
      ).toLocaleString(lang),
      features: pPlans.starter.features,
    },
    {
      name: pPlans.standard.name,
      price: subscriptionPackages.standard.dollarAmount,
      isPopular: true,
      pricePer1kCredits: subscriptionPackages.standard.pricePer1kCredits,
      saveFromPrevPlanPer1kCredits: hideFreePlan
        ? Number(
            (
              (subscriptionPackages.starter.dollarAmount /
                subscriptionPackages.starter.baseCredits) *
                1000 -
              Number(subscriptionPackages.standard.pricePer1kCredits)
            ).toFixed(2),
          )
        : undefined,
      description: pPlans.standard.description,
      buttonText: pPlans.subscribe,
      buttonVariant: 'default',
      creditsText: plansT('x_credits', {
        numCredits: subscriptionPackages.standard.baseCreditsLocale,
      }),
      subscriptionBonusCredits: (
        subscriptionPackages.standard.credits -
        subscriptionPackages.standard.baseCredits
      ).toLocaleString(lang),
      features: pPlans.standard.features,
    },
    {
      name: pPlans.pro.name,
      price: subscriptionPackages.pro.dollarAmount,
      pricePer1kCredits: subscriptionPackages.pro.pricePer1kCredits,
      saveFromPrevPlanPer1kCredits: Number(
        (
          Number(subscriptionPackages.standard.pricePer1kCredits) -
          Number(subscriptionPackages.pro.pricePer1kCredits)
        ).toFixed(2),
      ),
      description: pPlans.pro.description,
      buttonText: pPlans.subscribe,
      buttonVariant: 'default',
      creditsText: plansT('x_credits', {
        numCredits: subscriptionPackages.pro.baseCreditsLocale,
      }),
      subscriptionBonusCredits: (
        subscriptionPackages.pro.credits - subscriptionPackages.pro.baseCredits
      ).toLocaleString(lang),
      features: pPlans.pro.features,
    },
  ];

  const promoTheme = process.env.NEXT_PUBLIC_PROMO_THEME || 'pink';

  return (
    <PricingCards
      className={className}
      disableSubscriptionToggle={!shouldShowSubscriptionPlans}
      isPromoEnabled={isPromoEnabled}
      promoBannerText={bannerTranslations?.pricing.bannerText}
      promoTheme={promoTheme}
      subscriptionPlans={subscriptionPlans}
      topupPlans={topupPlans}
    />
  );
}

export default PricingTable;
