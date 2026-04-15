'use client';

import { Loader2 } from 'lucide-react';
import { useActionState } from 'react';

import { createCheckoutSession } from '@/app/[lang]/actions/stripe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface SubscriptionCheckoutDict {
  billing: {
    monthly: string;
  };
  plans: {
    popular: string;
    subscribe: string;
  };
  status: {
    checkoutError: string;
  };
  topup: {
    processing: string;
  };
}

export interface SubscriptionPlan {
  credits: string;
  id: 'starter' | 'standard' | 'pro';
  isPopular?: boolean;
  name: string;
  price: number;
  recurringPrice?: number;
}

interface SubscriptionCheckoutProps {
  dict: SubscriptionCheckoutDict;
  plans: SubscriptionPlan[];
}

interface ActionState {
  error: string | null;
  success: boolean;
}

const initialState: ActionState = {
  error: null,
  success: false,
};

export function SubscriptionCheckout({
  dict,
  plans,
}: SubscriptionCheckoutProps) {
  return (
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
      {plans.map((plan) => (
        <SubscriptionCheckoutCard dict={dict} key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

function SubscriptionCheckoutCard({
  dict,
  plan,
}: {
  dict: SubscriptionCheckoutDict;
  plan: SubscriptionPlan;
}) {
  const formAction = async (
    _prevState: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    try {
      const packageId = formData.get('packageId') as SubscriptionPlan['id'];

      const { url } = await createCheckoutSession(formData, packageId);

      if (url) {
        window.location.assign(url);
        return { error: null, success: true };
      }

      throw new Error('No checkout URL received');
    } catch (error) {
      console.error('Error creating subscription checkout session:', error);
      return {
        error: dict.status.checkoutError,
        success: false,
      };
    }
  };

  const [state, formActionDispatch, pending] = useActionState(
    formAction,
    initialState,
  );

  return (
    <Card
      className={`grid gap-2 p-6 ${plan.isPopular ? 'border-none ring-2 ring-promo-accent' : ''}`}
    >
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-xl">{plan.name}</h3>
          {plan.isPopular ? (
            <Badge className="rounded-full bg-promo-text">
              {dict.plans.popular}
            </Badge>
          ) : null}
        </div>

        <div className="mt-2">
          <div className="flex items-baseline gap-1">
            <span className="font-bold text-3xl">${plan.price}</span>
            <span className="text-muted-foreground text-sm">first month</span>
          </div>
          <div className="mt-1 text-muted-foreground text-sm">
            then ${plan.recurringPrice ?? plan.price}
            {dict.billing.monthly}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="font-medium text-sm">{plan.credits} credits total</div>
        <div className="text-muted-foreground text-xs">
          (includes 15% bonus)
        </div>
      </div>

      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-red-600 text-xs">{state.error}</p>
        </div>
      )}

      <form action={formActionDispatch}>
        <input name="packageId" type="hidden" value={plan.id} />
        <input name="type" type="hidden" value="subscription" />
        <input name="uiMode" type="hidden" value="hosted" />
        <Button className="mt-4 w-full" disabled={pending} type="submit">
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {dict.topup.processing}
            </>
          ) : (
            dict.plans.subscribe
          )}
        </Button>
      </form>
    </Card>
  );
}
