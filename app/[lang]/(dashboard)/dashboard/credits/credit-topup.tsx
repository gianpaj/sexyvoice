'use client';

import { Loader2, Minus, Plus, Zap } from 'lucide-react';
import { useState } from 'react';

import { createCheckoutSession, createCustomCheckoutSession } from '@/app/actions/stripe';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  calculateCreditPrice,
  formatCredits,
  formatPrice,
  validateCreditAmount,
} from '@/lib/utils';
import type lang from '@/lib/i18n/dictionaries/en.json';

const getTopupPackages = (dict: any) => [
  {
    id: 'standard',
    name: dict.topup.packages.standard.name,
    price: '$5',
    credits: '10,000',
    value: '',
    popular: false,
    description: dict.topup.packages.standard.description,
  },
  {
    id: 'base',
    name: dict.topup.packages.base.name,
    price: '$10',
    credits: '25,000',
    value: dict.topup.packages.base.value,
    popular: true,
    description: dict.topup.packages.base.description,
  },
  {
    id: 'premium',
    name: dict.topup.packages.premium.name,
    price: '$99',
    credits: '300,000',
    value: dict.topup.packages.premium.value,
    popular: false,
    description: dict.topup.packages.premium.description,
  },
];

interface CreditTopupProps {
  dict: (typeof lang)['credits'];
}

export function CreditTopup({ dict }: CreditTopupProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customCredits, setCustomCredits] = useState<number>(5000);
  const TOPUP_PACKAGES = getTopupPackages(dict);

  const formAction = async (data: FormData): Promise<void> => {
    const packageType = data.get('packageType') as
      | 'standard'
      | 'base'
      | 'premium'
      | 'custom';

    setLoading(packageType);
    setError(null);

    try {
      let url: string | null = null;

      if (packageType === 'custom') {
        const validatedCredits = validateCreditAmount(customCredits);
        const result = await createCustomCheckoutSession(validatedCredits);
        url = result.url;
      } else {
        const result = await createCheckoutSession(data, packageType);
        url = result.url;
      }

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

  const handleCustomAmountChange = (value: string) => {
    const numValue = Number.parseInt(value) || 5000;
    setCustomCredits(validateCreditAmount(numValue));
  };

  const adjustCustomAmount = (increment: number) => {
    const newAmount = customCredits + increment;
    setCustomCredits(validateCreditAmount(Math.max(5000, newAmount)));
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-4">
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

        {/* Custom Credits Card */}
        <Card className="relative">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Custom Amount
            </CardTitle>
            <CardDescription>
              Choose your own credit amount (min. 5,000)
            </CardDescription>
          </CardHeader>

          <CardContent className="text-center space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-credits">Credits</Label>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => adjustCustomAmount(-500)}
                  disabled={customCredits <= 5000}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="custom-credits"
                  type="number"
                  min="5000"
                  step="500"
                  value={customCredits}
                  onChange={(e) => handleCustomAmountChange(e.target.value)}
                  className="text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => adjustCustomAmount(500)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Increments of 500
              </div>
            </div>

            <div className="text-3xl font-bold text-primary">
              {formatPrice(calculateCreditPrice(customCredits))}
            </div>
            <div className="text-sm font-medium">
              {formatCredits(customCredits)} credits
            </div>
            <div className="text-sm text-muted-foreground">
              {dict.topup.onetimePurchase}
            </div>
          </CardContent>

          <CardFooter>
            <form action={formAction} className="w-full">
              <input type="hidden" name="packageType" value="custom" />
              <input type="hidden" name="uiMode" value="hosted" />
              <Button
                type="submit"
                className="w-full"
                disabled={loading === 'custom'}
                size="lg"
              >
                {loading === 'custom' ? (
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
      </div>
    </>
  );
}
