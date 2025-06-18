import Link from 'next/link';
import Script from 'next/script';
// import Stripe from 'stripe';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import { CreditHistory } from './credit-history';
import { CreditTopup } from './credit-topup';
import { getCustomerSession } from '@/lib/stripe/stripe-admin';
import type Stripe from 'stripe';
import { getCustomerData } from '@/lib/redis/queries';
import { getUserById } from '@/lib/supabase/queries';
import { TopupStatus } from './topup-status';

// interface StripeProduct {
//   id: string;
//   name: string;
//   description: string | null;
//   features: string[];
//   price: Stripe.Price;
// }

// async function getStripeProducts(): Promise<StripeProduct[]> {
//   if (!process.env.STRIPE_SECRET_KEY) {
//     throw new Error('STRIPE_SECRET_KEY is not set');
//   }

//   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
//     apiVersion: '2025-02-24.acacia',
//   });

//   const product = await stripe.products.retrieve('prod_RyjYjy3DObZ4pm', {
//     expand: ['default_price'],
//   });

//   const products = { data: [product] };

//   const productsData = products.data.filter(
//     (product) => product.active === true,
//   );

//   // console.dir(productsData, { depth: null });

//   return productsData.map((product) => ({
//     id: product.id,
//     name: product.name,
//     description: product.description,
//     features: product.marketing_features.map((feature) => feature.name || ''),
//     // ? JSON.parse(product.metadata.features)
//     // : [],
//     price: product.default_price as Stripe.Price,
//   }));
// }

export default async function CreditsPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  const supabase = await createClient();
  const dict = await getDictionary(lang, 'credits');

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  const userData = user && (await getUserById(user.id));
  if (!user || !userData || !userData.stripe_id) {
    throw new Error('User not found');
  }

  const customerData = await getCustomerData(userData.stripe_id);

  const clientSecret = await getCustomerSession();

  const { data: existingTransactions } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-8">
      <TopupStatus dict={dict} />
      <div className="flex flex-col items-center justify-between gap-4 lg:flex-row">
        <div className="w-full lg:w-3/4">
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

      {/* Add Credit Top-up Section */}
      <div>
        <h3 className="mb-4 text-lg font-semibold">{dict.topup.title}</h3>
        <p className="text-muted-foreground mb-6">{dict.topup.description}</p>
        <CreditTopup dict={dict} />
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
        <h3 className="mb-4 text-lg font-semibold">{dict.history.title}</h3>
        <CreditHistory dict={dict} transactions={existingTransactions} />
      </div>

      {(!customerData || customerData.status !== 'active') && (
        <NextStripePricingTable clientSecret={clientSecret} />
      )}
    </div>
  );
}
const NextStripePricingTable = ({
  clientSecret,
}: {
  clientSecret: Stripe.Response<Stripe.CustomerSession> | null;
}) => {
  const pricingTableId = process.env.STRIPE_PRICING_ID;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!pricingTableId || !publishableKey || !clientSecret) return null;
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
        customer-session-client-secret={clientSecret.client_secret}
      />
    </>
  );
};
