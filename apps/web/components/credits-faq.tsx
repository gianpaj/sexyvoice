import { getMessages } from 'next-intl/server';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { faqAnswerText } from '@/lib/faq';
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
      <Accordion collapsible type="single">
        {group.questions.map((faq, index) => (
          <AccordionItem key={faq.question} value={`question-${index}`}>
            <AccordionTrigger>{faq.question}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              {faqAnswerText(faq.answer)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
