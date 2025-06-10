import Link from 'next/link';
import Script from 'next/script';
import Stripe from 'stripe';

import { Button } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getCurrentUser } from '@/lib/supabase/get-current-user';
import { CreditHistory } from './credit-history';

interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  features: string[];
  price: Stripe.Price;
}

async function getStripeProducts(): Promise<StripeProduct[]> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
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

export default async function CreditsPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  const { supabase, user } = await getCurrentUser();
  const dict = await getDictionary(lang, 'credits');

  if (!user) {
    throw new Error('User not found');
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row items-center justify-between">
        <div className="w-full lg:w-1/2">
          <h2 className="text-3xl font-bold tracking-tight">{dict.title}</h2>
          <p className="text-muted-foreground">{dict.description}</p>
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
            {dict.billing.monthly}
          </ToggleGroupItem>
          <ToggleGroupItem value="annually">
            {dict.billing.annually}
            <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 text-xs text-white">
              {dict.billing.monthsFree}
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div> */}

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
        <CreditHistory dict={dict} userId={user.id} />
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
