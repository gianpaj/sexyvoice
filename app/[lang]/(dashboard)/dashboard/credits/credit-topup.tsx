'use client';

import { Loader2, Zap } from 'lucide-react';
import { useState } from 'react';

import { createCheckoutSession } from '@/app/actions/stripe';
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
import type { PackageType } from '@/lib/stripe/pricing';

const getTopupPackages = (dict: (typeof lang)['credits']) => {
  const isHalloweenActive =
    process.env.NEXT_PUBLIC_HALLOWEEN_PROMO_ENABLED === 'true';

  return [
    {
      id: 'starter',
      name: dict.topup.packages.starter.name,
      price: '$5',
      credits: isHalloweenActive ? '13,000 🎃' : '10,000',
      value: isHalloweenActive ? 'Halloween Bonus!' : '',
      popular: false,
      description: dict.topup.packages.starter.description,
    },
    {
      id: 'standard',
      name: dict.topup.packages.standard.name,
      price: '$10',
      credits: isHalloweenActive ? '30,000 🎃' : '25,000',
      value: isHalloweenActive
        ? 'Halloween Bonus!'
        : dict.topup.packages.standard.value,
      popular: true,
      description: dict.topup.packages.standard.description,
    },
    {
      id: 'pro',
      name: dict.topup.packages.pro.name,
      price: '$99',
      credits: isHalloweenActive ? '235,000 🎃' : '220,000',
      value: isHalloweenActive
        ? 'Halloween Bonus!'
        : dict.topup.packages.pro.value,
      popular: false,
      description: dict.topup.packages.pro.description,
    },
  ];
};

interface CreditTopupProps {
  dict: (typeof lang)['credits'];
}

export function CreditTopup({ dict }: CreditTopupProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const TOPUP_PACKAGES = getTopupPackages(dict);

  const formAction = async (data: FormData): Promise<void> => {
    const packageType = data.get('packageType') as PackageType;

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
