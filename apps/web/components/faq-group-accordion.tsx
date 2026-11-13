import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { faqAnswerText } from '@/lib/faq';

export function FaqGroupAccordion({
  questions,
  className,
  itemClassName,
  defaultOpen = false,
}: {
  questions: readonly { question: string; answer: string }[];
  className?: string;
  itemClassName?: string;
  defaultOpen?: boolean;
}) {
  return (
    <Accordion
      className={className}
      collapsible
      defaultValue={defaultOpen ? 'item-0' : undefined}
      type="single"
    >
      {questions.map((faq, index) => (
        <AccordionItem
          className={itemClassName}
          key={faq.question}
          value={`item-${index}`}
        >
          <AccordionTrigger className="text-foreground">
            {faq.question}
          </AccordionTrigger>
          <AccordionContent className="whitespace-pre-wrap text-muted-foreground">
            {faqAnswerText(faq.answer)}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
