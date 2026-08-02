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
import { getMessages } from 'next-intl/server';

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

// Default group ids surfaced first, in this order. Pages reuse this component
// but each can lead with its own group via the `priorityGroupIds` prop; the
// general landing page keeps `liveCalling` first.
const DEFAULT_FAQ_GROUP_PRIORITY = ['liveCalling'];

// Any group not listed in `priority` keeps its original position from the
// message file (stable sort).
function sortFaqGroups<T extends { id: string }>(
  groups: readonly T[],
  priority: readonly string[],
): T[] {
  const priorityIndex = (id: string) => {
    const index = priority.indexOf(id);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  return [...groups].sort((a, b) => priorityIndex(a.id) - priorityIndex(b.id));
}

interface FaqLink {
  text: string;
  url: string;
}

function renderAnswer(answer: string, link?: FaqLink) {
  const processed = answer.replace('{count}', String(CREDITS_PER_MINUTE));
  if (!link) return processed;
  const parts = processed.split('{link}');
  if (parts.length !== 2) return processed;
  return (
    <>
      {parts[0]}
      <Link
        className="text-primary underline underline-offset-4 hover:no-underline"
        href={link.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {link.text}
      </Link>
      {parts[1]}
    </>
  );
}

export const FAQComponent = async ({
  lang,
  priorityGroupIds = DEFAULT_FAQ_GROUP_PRIORITY,
}: {
  lang: Locale;
  /**
   * Group ids to surface first, in order; the first present group also opens by
   * default. Lets each page lead with its own group (e.g. the voice cloning
   * page passes `['voiceCloning']`). Defaults to `liveCalling`.
   */
  priorityGroupIds?: readonly string[];
}) => {
  const dict = ((await getMessages({ locale: lang })) as IntlMessages).landing
    .faq;
  const groups = sortFaqGroups(dict.groups, priorityGroupIds);
  return (
    <>
      <div className="mb-12 text-left md:text-center">
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
                      {renderAnswer(
                        faq.answer,
                        (faq as { link?: FaqLink }).link,
                      )}
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
