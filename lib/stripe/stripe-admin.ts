import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';

import { getUserById } from '../supabase/queries';
import { createClient } from '../supabase/server';

// import { createClient } from '../supabase/server';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
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

  if (customers.data.length && customers.data[0]?.id === uuid)
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

export async function getCustomerSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser || !dbUser.stripe_id) {
    return null;
  }

  try {
    const customerSession = await stripe.customerSessions.create({
      customer: dbUser.stripe_id,
      components: {
        pricing_table: {
          enabled: true,
        },
      },
    });

    return customerSession;
  } catch (error) {
    Sentry.captureException({
      message: 'Error creating Stripe customer session',
      error,
      userId: user.id,
      stripe_id: dbUser.stripe_id,
    });
    console.error('Error creating Stripe customer session:', error);
    throw error;
  }
}
