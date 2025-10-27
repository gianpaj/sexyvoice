import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';

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

export async function createCustomerSession(userId: string, stripe_id: string) {
  try {
    const customerSession = await stripe.customerSessions.create({
      customer: stripe_id,
      components: {
        pricing_table: {
          enabled: true,
        },
      },
    });

    return customerSession;
  } catch (error) {
    console.error('Error creating Stripe customer session:', error);
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }
    Sentry.captureException({
      message: 'Error creating Stripe customer session',
      error,
      userId,
      stripe_id,
    });
    throw error;
  }
}
