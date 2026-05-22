import {
  ChevronRightIcon,
  Coins,
  Languages,
  type LucideIcon,
  PhoneCall,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Locale } from '@/lib/i18n/i18n-config';
import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';

const faqIconMap: Record<string, LucideIcon> = {
  liveCalling: PhoneCall,
  voiceCreation: Sparkles,
  languages: Languages,
  trustAndPolicies: ShieldCheck,
  pricingAndAccess: Coins,
};

interface FaqLink {
  text: string;
  url: string;
}

export const FAQComponent = async ({ lang }: { lang: Locale }) => {
  const t = await getTranslations({ locale: lang, namespace: 'landing.faq' });
  const groups = t.raw('groups') as IntlMessages['landing']['faq']['groups'];

  return (
    <>
      <div className="mb-12 text-left md:text-center">
        <h2 className="mb-2 font-bold text-3xl text-white">{t('title')}</h2>
        <p className="text-gray-200">{t('subtitle')}</p>
      </div>

      <Accordion
        className="w-full rounded-md border border-gray-500"
        collapsible
        defaultValue="item-voiceCreation"
        type="single"
      >
        {groups.map((group, gi) => {
          const Icon = faqIconMap[group.id] ?? Sparkles;

          return (
            <AccordionItem
              className="border-gray-500 outline-none first:rounded-t-md last:rounded-b-md has-focus-visible:z-10 has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
              key={group.id}
              value={`item-${group.id}`}
            >
              <AccordionTrigger
                className="px-5 [&[data-state=open]>svg]:rotate-90"
                data-slot="accordion-trigger"
              >
                <span className="flex items-center gap-4">
                  <Icon className="size-4 shrink-0" />
                  <span>{group.category}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                {group.questions.map((faq, qi) => {
                  const faqLink = (faq as { link?: FaqLink }).link;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const answerKey = `groups.${gi}.questions.${qi}.answer` as any;
                  const answer = faqLink
                    ? t.rich(answerKey, {
                        count: CREDITS_PER_MINUTE,
                        link: (
                          <Link
                            className="text-primary underline underline-offset-4 hover:no-underline"
                            href={faqLink.url}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            {faqLink.text}
                          </Link>
                        ),
                      })
                    : t(answerKey, { count: CREDITS_PER_MINUTE });

                  return (
                    <Collapsible
                      className="border-gray-500 border-t bg-accent px-5 text-muted-foreground"
                      defaultOpen={qi === 0}
                      key={qi}
                    >
                      <CollapsibleTrigger className="flex items-center gap-4 py-4 text-left text-white focus-visible:z-10 [&[data-state=open]>svg]:rotate-90">
                        <ChevronRightIcon className="size-4 shrink-0 transition-transform duration-200" />
                        {faq.question}
                      </CollapsibleTrigger>
                      <CollapsibleContent className="whitespace-pre-wrap pb-4 text-sm">
                        {answer}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </>
  );
};
