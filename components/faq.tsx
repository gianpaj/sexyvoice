import { Trigger as AccordionPrimitiveTrigger } from '@radix-ui/react-accordion';
import {
  ChevronRightIcon,
  Coins,
  Languages,
  type LucideIcon,
  PhoneCall,
  PlusIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Accordion, AccordionContent, AccordionItem } from './ui/accordion';

const faqIconMap: Record<string, LucideIcon> = {
  liveCalling: PhoneCall,
  voiceCreation: Sparkles,
  languages: Languages,
  trustAndPolicies: ShieldCheck,
  pricingAndAccess: Coins,
};

export const FAQComponent = async ({ lang }: { lang: Locale }) => {
  const dict = (await getDictionary(lang, 'landing')).faq;
  return (
    <>
      <div className="mb-12 text-left md:text-center">
        <h2 className="mb-2 font-bold text-3xl text-white">{dict.title}</h2>
        <p className="text-gray-200">{dict.subtitle}</p>
      </div>

      <Accordion
        className="w-full rounded-md border border-gray-500"
        collapsible
        defaultValue="item-voiceCreation"
        type="single"
      >
        {dict.groups.map((group) => {
          const Icon = faqIconMap[group.id] ?? Sparkles;

          return (
            <AccordionItem
              className="border-gray-500 outline-none first:rounded-t-md last:rounded-b-md has-focus-visible:z-10 has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
              key={group.id}
              value={`item-${group.id}`}
            >
              <AccordionPrimitiveTrigger
                className="flex w-full items-start justify-between gap-4 rounded-md px-5 py-4 text-left font-medium text-sm text-white outline-none hover:underline disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:-rotate-45"
                data-slot="accordion-trigger"
              >
                <span className="flex items-center gap-4">
                  <Icon className="size-4 shrink-0" />
                  <span>{group.category}</span>
                </span>
                <PlusIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
              </AccordionPrimitiveTrigger>
              <AccordionContent className="pb-0">
                {group.questions.map((faq, i) => (
                  <Collapsible
                    className="border-gray-500 border-t bg-accent px-5"
                    defaultOpen={i === 0}
                    key={i}
                  >
                    <CollapsibleTrigger className="flex w-full items-center gap-4 rounded-sm py-4 text-left font-medium text-white outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&[data-state=open]>svg]:rotate-90">
                      <ChevronRightIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
                      {faq.question}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="whitespace-pre-wrap pb-4 text-muted-foreground text-sm">
                      {faq.answer}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </>
  );
};
