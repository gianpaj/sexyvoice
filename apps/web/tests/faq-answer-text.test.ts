import { describe, expect, it } from 'vitest';

import { faqAnswerText } from '@/lib/faq';
import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';

describe('faqAnswerText', () => {
  it('fills in the call price and the link text', () => {
    expect(
      faqAnswerText('{count} credits a minute. See the {link}.', {
        text: 'documentation',
      }),
    ).toBe(`${CREDITS_PER_MINUTE} credits a minute. See the documentation.`);
  });

  it('keeps {link} for a renderer that adds the link itself', () => {
    expect(faqAnswerText('See the {link}.')).toBe('See the {link}.');
  });
});
