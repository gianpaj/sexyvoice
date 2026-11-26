import { getMessages } from 'next-intl/server';

import { FaqGroupAccordion } from '@/components/faq-group-accordion';
import type { Locale } from '@/lib/i18n/i18n-config';

export async function CreditsFaq({ lang }: { lang: Locale }) {
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const group = messages.landing.faq.groups.find(
    (item) => item.id === 'pricingAndAccess',
  );
  if (!group) return null;

  return (
    <section aria-labelledby="credits-faq-title">
      <h3 className="mb-4 font-semibold text-lg" id="credits-faq-title">
        {group.category}
      </h3>
      <FaqGroupAccordion questions={group.questions} />
    </section>
  );
}
