'use client';

import { Loader2, Zap } from 'lucide-react';
import { useState } from 'react';

import { createCheckoutSession } from '@/app/[lang]/actions/stripe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type lang from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getTopupPackages, PackageType } from '@/lib/stripe/pricing';

interface CreditTopupProps {
  dict: (typeof lang)['credits'];
  lang: Locale;
}

export function CreditTopup({ dict, lang }: CreditTopupProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pricingPackages = getTopupPackages(lang);
  const isPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';

  const promoEmoji = isPromoEnabled ? ' 🎃' : '';

  const TOPUP_PACKAGES = [
    {
      id: 'starter',
      name: dict.topup.packages.starter.name.replace(
        '__NUM_CREDITS__',
        pricingPackages.standard.baseCreditsLocale,
      ),
      price: `$${pricingPackages.starter.dollarAmount}`,
      credits: pricingPackages.starter.credits.toLocaleString(lang),
      value: isPromoEnabled
        ? `Promo Bonus! ${promoEmoji} +${pricingPackages.starter.promoBonus}`
        : '',
      popular: false,
      description: dict.topup.packages.starter.description,
    },
    {
      id: 'standard',
      name: dict.topup.packages.standard.name.replace(
        '__NUM_CREDITS__',
        pricingPackages.standard.baseCreditsLocale,
      ),
      price: `$${pricingPackages.standard.dollarAmount}`,
      credits: pricingPackages.standard.credits.toLocaleString(lang),
      value: isPromoEnabled
        ? `Promo Bonus! ${promoEmoji} +${pricingPackages.standard.promoBonus}`
        : dict.topup.packages.standard.value,
      popular: true,
      description: dict.topup.packages.standard.description,
    },
    {
      id: 'pro',
      name: dict.topup.packages.pro.name.replace(
        '__NUM_CREDITS__',
        pricingPackages.pro.baseCreditsLocale,
      ),
      price: `$${pricingPackages.pro.dollarAmount}`,
      credits: pricingPackages.pro.credits.toLocaleString(lang),
      value: isPromoEnabled
        ? `Promo Bonus! ${promoEmoji} +${pricingPackages.pro.promoBonus}`
        : dict.topup.packages.pro.value,
      popular: false,
      description: dict.topup.packages.pro.description,
    },
  ];

  const formAction = async (data: FormData): Promise<void> => {
    const packageType = data.get('packageType') as
      | 'starter'
      | 'standard'
      | 'pro';
    setLoading(packageType);
    setError(null);

    try {
      const { url } = await createCheckoutSession(data, packageType);

      if (url) {
        window.location.assign(url);
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      setError(dict.status.checkoutError);
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-3">
        {TOPUP_PACKAGES.map((package_) => (
          <Card
            key={package_.id}
            className={`relative ${
              package_.popular ? 'ring-2 ring-primary shadow-lg' : ''
            }`}
          >
            {package_.popular && (
              <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                {dict.topup.mostPopular}
              </Badge>
            )}

            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                {package_.name}
              </CardTitle>
              <CardDescription>{package_.description}</CardDescription>
            </CardHeader>

            <CardContent className="text-center">
              <div className="text-3xl font-bold text-primary">
                {package_.price}
              </div>
              {package_.value && (
                <Badge variant="secondary" className="mt-2">
                  {package_.value}
                </Badge>
              )}
              <div className="text-sm text-muted-foreground mt-2">
                {dict.topup.onetimePurchase}
              </div>
            </CardContent>

            <CardFooter>
              <form action={formAction} className="w-full">
                <input type="hidden" name="packageType" value={package_.id} />
                <input type="hidden" name="uiMode" value="hosted" />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading === package_.id}
                  size="lg"
                >
                  {loading === package_.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {dict.topup.processing}
                    </>
                  ) : (
                    dict.topup.buyCredits
                  )}
                </Button>
              </form>
            </CardFooter>
          </Card>
        ))}
      </div>
    </>
  );
}
