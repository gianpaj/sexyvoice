export const getTopupPackages = () => {
  const isHalloweenActive =
    process.env.NEXT_PUBLIC_HALLOWEEN_PROMO_ENABLED === 'true';

  return {
    standard: {
      priceId: process.env.STRIPE_TOPUP_5_PRICE_ID,
      credits: isHalloweenActive ? 12_000 : 10_000, // +20%
      amount: 5, // $5.00
    },
    base: {
      priceId: process.env.STRIPE_TOPUP_10_PRICE_ID,
      credits: isHalloweenActive ? 32_500 : 25_000, // +30%
      amount: 10, // $10.00
    },
    premium: {
      priceId: process.env.STRIPE_TOPUP_99_PRICE_ID,
      credits: isHalloweenActive ? 405_000 : 300_000, // +35%
      amount: 99, // $99.00
    },
  } as const;
};

export const TOPUP_PACKAGES = getTopupPackages();

export type PackageType = keyof typeof TOPUP_PACKAGES;
