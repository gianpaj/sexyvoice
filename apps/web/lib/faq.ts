import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';

/**
 * A FAQ answer as plain text: the call price filled in, and `{link}` replaced
 * by the link's text. The landing FAQ renders the link itself, so it omits
 * `link`.
 */
export function faqAnswerText(answer: string, link?: { text: string }) {
  const text = answer.replaceAll('{count}', String(CREDITS_PER_MINUTE));
  return link ? text.replaceAll('{link}', link.text) : text;
}
