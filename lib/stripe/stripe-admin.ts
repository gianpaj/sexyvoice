import Stripe from 'stripe';
import { createClient } from '../supabase/server';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-01-27.acacia',
});

// https://github.com/Domogo/t3-supabase-drizzle-app-starter
export async function createOrRetrieveCustomer({
  uuid,
  email,
}: {
  uuid: string;
  email: string;
}) {
  const customers = await stripe.customers.list({ email });

  if (customers.data.length && customers?.data[0]?.id === uuid)
    return customers.data[0].id;

  const customer = await stripe.customers.create({
    email,
    metadata: { supabaseUUID: uuid },
  });

  return customer.id;
}

// export async function getStripePlan() {
//   const supabase = createClient()
//   const {
//     data: { user }
//   } = await supabase.auth.getUser()
//   if (!user) {
//     throw new Error('User not found')
//   }
//   const subscription = await stripe.subscriptions.retrieve(user.plan)
//   const productId = subscription.items.data[0].plan.product as string
//   const product = await stripe.products.retrieve(productId)
//   return product.name
// }

export async function createStripeCustomer(
  id: string,
  email: string,
  name?: string,
) {
  const customer = await stripe.customers.create({
    name: name ? name : '',
    email: email,
    metadata: {
      supabase_id: id,
    },
  });
  // Create a new customer in Stripe
  return customer.id;
}
