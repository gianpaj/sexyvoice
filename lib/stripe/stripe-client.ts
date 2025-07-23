import { getCustomerData } from '../redis/queries';
import { getUserById } from '../supabase/queries';

export async function checkUserPaidStatus(userId: string) {
  // Get user data
  const userData = await getUserById(userId);
  if (!userData?.stripe_id) {
    return { isPaidUser: false, reason: 'No Stripe customer ID' };
  }

  // Check active subscription
  const customerData = await getCustomerData(userData.stripe_id);
  const hasActiveSubscription = customerData?.status === 'active';

  // const paidTransactions = await getPaidTransactions(userId);

  // const hasPaidTransactions = paidTransactions && paidTransactions.length > 0;

  return {
    isPaidUser: hasActiveSubscription,
    // isPaidUser: hasActiveSubscription || hasPaidTransactions,
    // hasActiveSubscription,
    // hasPaidTransactions,
    // lastPaidTransaction: paidTransactions?.[0],
    subscriptionStatus: customerData?.status,
  };
}
