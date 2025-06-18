'use client';

import { useState } from 'react';
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
import { Loader2, Zap } from 'lucide-react';
import { createCheckoutSession } from '@/app/actions/stripe';
import getStripe from '@/utils/get-stripejs';
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from '@stripe/react-stripe-js';


const TOPUP_PACKAGES = [
  {
    id: 'standard',
    name: '10,000 Credits',
    price: '$5',
    credits: '10,000',
    value: '',
    popular: false,
    description: 'Perfect for getting started',
  },
  {
    id: 'standard',
    name: '25,000 Credits',
    price: '$10',
    credits: '25,000',
    value: 'Best Value',
    popular: true,
    description: 'Most popular choice',
  },
  {
    id: 'premium',
    name: '220,000 Credits',
    price: '$99',
    credits: '220,000',
    value: 'Pro Pack',
    popular: false,
    description: 'For power users',
  },
];

interface CreditTopupProps {
  dict: any; // Replace with proper type when available
}

export function CreditTopup({ dict }: CreditTopupProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formAction = async (data: FormData): Promise<void> => {
    const packageType = data.get('packageType') as 'standard' | 'base' | 'premium';
    const uiMode = data.get('uiMode') as 'hosted' | 'embedded';

    setLoading(packageType);
    setError(null);

    try {
      const { client_secret, url } = await createCheckoutSession(data, packageType);

      if (uiMode === 'embedded' && client_secret) {
        setClientSecret(client_secret);
      } else if (url) {
        window.location.assign(url);
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      setError('Failed to create checkout session');
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
              Most Popular
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
              One-time purchase
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
                    Processing...
                  </>
                ) : (
                  'Buy Credits'
                )}
              </Button>
            </form>
          </CardFooter>
        </Card>
        ))}
      </div>
      {clientSecret && (
        <div className="mt-8">
          <EmbeddedCheckoutProvider
            stripe={getStripe()}
            options={{ clientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      )}
    </>
  );
}
