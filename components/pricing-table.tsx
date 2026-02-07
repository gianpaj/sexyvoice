import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getTopupPackages } from '@/lib/stripe/pricing';

import { PricingCards } from './pricing-cards';

async function PricingTable({ lang }: { lang: Locale }) {
  const credits = await getDictionary(lang, 'credits');
  const translations = process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS;
  const promos = await getDictionary(lang, 'promos');
  const bannerTranslations =
    translations && Object.hasOwn(promos, translations)
      ? promos[translations as keyof typeof promos]
      : undefined;
  const { plans: pPlans, billing } = credits;

  const isPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';

  const TOPUP_PACKAGES = getTopupPackages(lang);

  const plans = [
    {
      name: pPlans.free.name,
      oneTimePrice: 0,
      monthlyPrice: 0,
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
      name: pPlans.starter.name,
      oneTimePrice: TOPUP_PACKAGES.starter.dollarAmount,
      monthlyPrice: Math.round(TOPUP_PACKAGES.starter.dollarAmount * 0.8),
      isPopular: true,
      pricePer1kCredits: TOPUP_PACKAGES.starter.pricePer1kCredits,
      description: pPlans.starter.description,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: pPlans.x_credits.replace(
        '__NUM_CREDITS__',
        TOPUP_PACKAGES.starter.baseCreditsLocale,
      ),
      promoBonus: TOPUP_PACKAGES.starter.promoBonus,
      features: pPlans.starter.features,
    },
    {
      name: pPlans.standard.name,
      oneTimePrice: TOPUP_PACKAGES.standard.dollarAmount,
      monthlyPrice: Math.round(TOPUP_PACKAGES.standard.dollarAmount * 0.8),
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
      name: pPlans.plus.name,
      oneTimePrice: TOPUP_PACKAGES.plus.dollarAmount,
      monthlyPrice: +(TOPUP_PACKAGES.plus.dollarAmount * 0.8).toFixed(2),
      pricePer1kCredits: TOPUP_PACKAGES.plus.pricePer1kCredits,
      description: pPlans.plus.description,
      buttonText: pPlans.buyCredits,
      buttonVariant: 'default',
      creditsText: pPlans.x_credits.replace(
        '__NUM_CREDITS__',
        TOPUP_PACKAGES.plus.baseCreditsLocale,
      ),
      promoBonus: TOPUP_PACKAGES.plus.promoBonus,
      features: pPlans.plus.features,
    },
    {
      name: pPlans.pro.name,
      oneTimePrice: TOPUP_PACKAGES.pro.dollarAmount,
      monthlyPrice: Math.round(TOPUP_PACKAGES.pro.dollarAmount * 0.8),
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

  const promoTheme = process.env.NEXT_PUBLIC_PROMO_THEME || 'pink';

  return (
    <PricingCards
      billing={billing}
      isPromoEnabled={isPromoEnabled}
      lang={lang}
      plans={plans}
      popularLabel={pPlans.popular}
      promoBannerText={bannerTranslations?.pricing.bannerText}
      promoTheme={promoTheme}
    />
  );
}

export default PricingTable;
