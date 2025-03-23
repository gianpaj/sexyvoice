import { createClient } from '@/lib/supabase/server';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, CreditCard } from 'lucide-react';
import { CreditHistory } from './credit-history';
import Stripe from 'stripe';
import Link from 'next/link';
import Script from 'next/script';
// Types
interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  features: string[];
  price: Stripe.Price;
}

// This makes the page dynamic instead of static
export const revalidate = 3600; // Revalidate every hour

async function getStripeProducts(): Promise<StripeProduct[]> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-01-27.acacia',
  });

  const product = await stripe.products.retrieve('prod_RyjYjy3DObZ4pm', {
    expand: ['default_price'],
  });

  const products = { data: [product] };

  const productsData = products.data.filter(
    (product) => product.active === true,
  );

  // console.dir(productsData, { depth: null });

  return productsData.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    features: product.marketing_features.map((feature) => feature.name || ''),
    // ? JSON.parse(product.metadata.features)
    // : [],
    price: product.default_price as Stripe.Price,
  }));
}

export default async function CreditsPage({
  params: { lang },
}: {
  params: { lang: Locale };
}) {
  const supabase = createClient();
  const dict = await getDictionary(lang);

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  const { data: credits } = await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', user?.id)
    .single();

  // const products = await getStripeProducts();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {dict.credits.title}
          </h2>
          <p className="text-muted-foreground">{dict.credits.description}</p>
        </div>
        <Button asChild>
          <Link
            href={'https://billing.stripe.com/p/login/28o01hfsn1gUccU8ww'}
            target="_blank"
          >
            Stripe Customer Portal
          </Link>
        </Button>
      </div>

      {/* <div className="flex justify-center space-x-4">
        <ToggleGroup type="single" defaultValue="monthly">
          <ToggleGroupItem value="monthly">
            {dict.credits.billing.monthly}
          </ToggleGroupItem>
          <ToggleGroupItem value="annually">
            {dict.credits.billing.annually}
            <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 text-xs text-white">
              {dict.credits.billing.monthsFree}
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div> */}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {dict.credits.availableCredits}
            </CardTitle>
            <CreditCard className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{credits?.amount || 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {dict.credits.creditsUsage}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* {products.map((product) => (
        <Card key={product.id}>
          <CardHeader>
            <CardTitle>{product.name}</CardTitle>
            <CardDescription>{product.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {product.price.unit_amount
                ? `$${(product.price.unit_amount / 100).toFixed(2)}/${product.price.recurring?.interval}`
                : 'Custom'}
            </p>
            <ul className="mt-4 space-y-2">
              {product.features?.map((feature, index) => (
                <li key={index} className="flex items-center">
                  <Check className="mr-2 size-4 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Link
              className="text-sm font-medium hover:underline underline-offset-4 w-full"
              href={`/signup?plan=${product.id}`}
            >
              <Button className="w-full">Get Started</Button>
            </Link>
          </CardFooter>
        </Card>
      ))} */}

      <div className="my-8">
        <h3 className="mb-4 text-lg font-semibold">Credit History</h3>
        {/* @ts-ignore */}
        <CreditHistory dict={dict} userId={user?.id} />
      </div>

      <NextStripePricingTable
        pricingTableId="prctbl_1R4mzLJ2uQQSTCBs4u5WHbac"
        publishableKey="pk_live_51OddRpJ2uQQSTCBs8qxECPQ1TtH6urXhq1mFEDBbfN82vt1aSJp8rVIgXoQHw5tW7Q7ehdPzUvPXdANnDXIGJKUx00gMcxE4S3"
        clientReferenceId={user?.id}
      />
    </div>
  );
}
const NextStripePricingTable = ({
  pricingTableId,
  publishableKey,
  clientReferenceId,
}: {
  pricingTableId: string;
  publishableKey: string;
  clientReferenceId?: string;
}) => {
  if (!pricingTableId || !publishableKey) return null;
  return (
    <>
      <Script
        async
        strategy="lazyOnload"
        src="https://js.stripe.com/v3/pricing-table.js"
      />
      {/* @ts-ignore */}
      <stripe-pricing-table
        pricing-table-id={pricingTableId}
        publishable-key={publishableKey}
        client-reference-id={clientReferenceId}
      />
    </>
  );
};
