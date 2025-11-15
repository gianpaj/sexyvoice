import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';

import { type CustomerData, setCustomerData } from '../redis/queries';
import { createClient } from '../supabase/server';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
});

// https://github.com/Domogo/t3-supabase-drizzle-app-starter
export async function createOrRetrieveCustomer(
  userId: string,
  email: string,
  existingStripeId?: string | null,
) {
  const ensureCustomerMetadata = async (customer: Stripe.Customer | null) => {
    if (!customer) return null;

    const metadata = customer.metadata ?? {};
    const metadataUuid = metadata.supabaseUUID;

    if (metadataUuid && metadataUuid !== userId) {
      const error = new Error(
        `Stripe customer ${customer.id} already linked to Supabase user ${metadataUuid}.`,
      );
      console.error(error.message);
      Sentry.captureException(error, {
        level: 'error',
        extra: {
          customerId: customer.id,
          metadataUuid,
          email,
          userId,
        },
      });
      throw error;
    }

    if (metadataUuid !== userId) {
      try {
        await stripe.customers.update(customer.id, {
          metadata: { ...metadata, supabaseUUID: userId },
        });
      } catch (error) {
        console.error(
          `Failed to update metadata for Stripe customer ${customer.id}`,
          error,
        );
        Sentry.captureException(error, {
          level: 'error',
          extra: {
            customerId: customer.id,
            email,
            userId,
          },
        });
        throw error;
      }
    }

    return updateStripeId(userId, customer.id);
  };

  const retrieveCustomerById = async (customerId: string) => {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && 'deleted' in customer && customer.deleted) {
        const message = `Stripe customer ${customerId} is deleted.`;
        console.error(message);
        Sentry.captureMessage(message, {
          level: 'warning',
          extra: { customerId, userId, email },
        });
        return null;
      }
      return customer as Stripe.Customer;
    } catch (error) {
      console.error(
        `Failed to retrieve Stripe customer with id ${customerId}`,
        error,
      );
      Sentry.captureException(error, {
        level: 'error',
        extra: { customerId, userId, email },
      });
      return null;
    }
  };

  if (existingStripeId) {
    const existingCustomer = await retrieveCustomerById(existingStripeId);
    const ensured = await ensureCustomerMetadata(existingCustomer);
    if (ensured) {
      return ensured;
    }
  }

  const constomersResults = await stripe.customers.search({
    query: `metadata['supabaseUUID']:'${userId}'`,
  });

  if (constomersResults.data.length > 1) {
    console.error(
      `Multiple customers found for supabaseUUID ${userId}. Using the first one.`,
    );
    Sentry.captureMessage(
      `Multiple customers found for supabaseUUID ${userId}. Using the first one.`,
      {
        level: 'warning',
        extra: {
          customerCount: constomersResults.data.length,
          email,
          userId,
        },
      },
    );
  }

  if (constomersResults.data.length && constomersResults.data[0]?.id) {
    const ensured = await ensureCustomerMetadata(constomersResults.data[0]);
    if (ensured) {
      return ensured;
    }
  }

  const customers = await stripe.customers.list({ email });

  if (customers.data.length > 1) {
    console.error(
      `Multiple customers found for email ${email}. Using the first one.`,
    );
    Sentry.captureMessage(
      `Multiple customers found for email ${email}. Using the first one.`,
      {
        level: 'warning',
        extra: { customerCount: customers.data.length, email, userId },
      },
    );
  }

  if (customers.data.length && customers.data[0]?.id) {
    const ensured = await ensureCustomerMetadata(customers.data[0]);
    if (ensured) {
      return ensured;
    }
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { supabaseUUID: userId },
  });

  const stripe_id = updateStripeId(userId, customer.id);

  console.info(
    `Created new Stripe customer with id ${customer.id} (${userId}) for email ${email}`,
  );
  Sentry.logger.info('Created new Stripe customer', {
    customerId: customer.id,
    email,
    userId,
  });

  return stripe_id;
}

// Helper function to update stripe_id in database
const updateStripeId = async (userId: string, stripeId: string) => {
  const supabase = await createClient();
  await supabase
    .from('profiles')
    .update({ stripe_id: stripeId })
    .eq('id', userId);
  return stripeId;
};

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

export async function refreshCustomerSubscriptionData(
  customerId: string,
): Promise<CustomerData> {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      const subData: CustomerData = { status: 'none' };
      await setCustomerData(customerId, subData);
      return subData;
    }

    const subscription = subscriptions.data[0];
    const subData: CustomerData = {
      subscriptionId: subscription.id,
      status: subscription.status,
      priceId: subscription.items.data[0].price.id,
      currentPeriodEnd: subscription.current_period_end,
      currentPeriodStart: subscription.current_period_start,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      paymentMethod:
        subscription.default_payment_method &&
        typeof subscription.default_payment_method !== 'string'
          ? {
              brand: subscription.default_payment_method.card?.brand ?? null,
              last4: subscription.default_payment_method.card?.last4 ?? null,
            }
          : null,
    };

    await setCustomerData(customerId, subData);

    return subData;
  } catch (error) {
    console.error('Error refreshing Stripe customer subscription data:', error);
    Sentry.captureException(error, {
      level: 'error',
      extra: { customerId },
    });
    throw error;
  }
}
