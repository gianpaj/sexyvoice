import {
  ChevronRightIcon,
  Coins,
  type LucideIcon,
  PhoneCall,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getMessages } from 'next-intl/server';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Locale } from '@/lib/i18n/i18n-config';
import { type FaqQuestion, faqGroups } from '@/lib/landing-content';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';

// Groups without an icon here show Sparkles.
const FAQ_ICONS: Record<string, LucideIcon> = {
  liveCalling: PhoneCall,
  pricingAndAccess: Coins,
  trustAndPolicies: ShieldCheck,
};

function Answer({ faq }: { faq: FaqQuestion }) {
  if (!faq.linked) {
    return faq.answer;
  }
  return (
    <>
      {faq.linked.before}
      <a
        className="text-primary underline underline-offset-4 hover:no-underline"
        href={faq.linked.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {faq.linked.text}
      </a>
      {faq.linked.after}
    </>
  );
}

export const FAQComponent = async ({
  lang,
  priorityGroupIds,
}: {
  lang: Locale;
  /**
   * Group ids to show first, in order; the first group also opens. The
   * voice cloning page leads with `voiceCloning`; the default is live calling.
   */
  priorityGroupIds?: readonly string[];
}) => {
  const dict = ((await getMessages({ locale: lang })) as IntlMessages).landing
    .faq;
  const groups = faqGroups(dict, priorityGroupIds);
  return (
    <>
      <div className="mb-12 text-left">
        <h2 className="mb-2 font-bold text-3xl text-white">{dict.title}</h2>
        <p className="text-gray-200">{dict.subtitle}</p>
      </div>

      <Accordion
        className="w-full rounded-md border border-gray-500"
        collapsible
        defaultValue={groups[0] ? `item-${groups[0].id}` : undefined}
        type="single"
      >
        {groups.map((group) => {
          const Icon = FAQ_ICONS[group.id] ?? Sparkles;

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
                {group.questions.map((faq, i) => (
                  <Collapsible
                    className="border-gray-500 border-t bg-accent px-5 text-muted-foreground"
                    defaultOpen={i === 0}
                    key={i}
                  >
                    <CollapsibleTrigger className="flex items-center gap-4 py-4 text-left text-white focus-visible:z-10 [&[data-state=open]>svg]:rotate-90">
                      <ChevronRightIcon className="size-4 shrink-0 transition-transform duration-200" />
                      {faq.question}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="whitespace-pre-wrap pb-4 text-sm">
                      <Answer faq={faq} />
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
