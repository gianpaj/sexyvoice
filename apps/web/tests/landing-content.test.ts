import { describe, expect, it } from 'vitest';

import { faqGroups, getLandingContent } from '@/lib/landing-content';
import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';
import en from '@/messages/en.json';

describe('faqGroups', () => {
  it('leads with the priority groups and keeps the rest in message order', () => {
    const ids = (priority?: string[]) =>
      faqGroups(en.landing.faq, priority).map((group) => group.id);
    const messageOrder = en.landing.faq.groups.map((group) => group.id);

    expect(ids()).toEqual([
      'liveCalling',
      ...messageOrder.filter((id) => id !== 'liveCalling'),
    ]);
    expect(ids(['voiceCloning'])).toEqual([
      'voiceCloning',
      ...messageOrder.filter((id) => id !== 'voiceCloning'),
    ]);
  });

  it('fills in the call price and splits answers around their link', () => {
    const questions = faqGroups(en.landing.faq).flatMap(
      (group) => group.questions,
    );
    const linked = questions.find((question) => question.linked);

    expect(questions.map((question) => question.answer).join()).not.toMatch(
      /\{(count|link)\}/,
    );
    expect(
      questions.some((question) =>
        question.answer.includes(`${CREDITS_PER_MINUTE}`),
      ),
    ).toBe(true);
    expect(linked?.answer).toBe(
      `${linked?.linked?.before}${linked?.linked?.text}${linked?.linked?.after}`,
    );
  });
});

describe('getLandingContent', () => {
  it('lists the feature cards in page order, linking the two demos', () => {
    expect(
      getLandingContent(en.landing).features.map((feature) => [
        feature.key,
        'href' in feature ? feature.href : null,
      ]),
    ).toEqual([
      ['voiceCalling', '/voice-call'],
      ['voiceCloneDemo', '/voice-cloning'],
      ['security', null],
      ['voiceCloning', null],
      ['multiLanguage', null],
    ]);
  });
});
