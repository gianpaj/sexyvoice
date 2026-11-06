import { faqAnswerText } from '@/lib/faq';

// What the landing page says, in the order it says it. The page, its FAQ
// structured data and its agent markdown all read this, so they agree.

type LandingMessages = IntlMessages['landing'];

interface FaqMessage {
  answer: string;
  link?: { text: string; url: string };
  question: string;
}

export interface FaqQuestion {
  /** The answer as plain text, with the link text in place of `{link}`. */
  answer: string;
  /** The answer around its link, for renderers that show the link. */
  linked?: { after: string; before: string; text: string; url: string };
  question: string;
}

export interface FaqGroup {
  category: string;
  id: string;
  questions: FaqQuestion[];
}

function faqQuestion({ answer, link, question }: FaqMessage): FaqQuestion {
  const [before, after, ...extra] = faqAnswerText(answer).split('{link}');
  return {
    answer: faqAnswerText(answer, link),
    ...(link &&
      after !== undefined &&
      extra.length === 0 && { linked: { after, before, ...link } }),
    question,
  };
}

/**
 * The FAQ groups, with `priority` ids first in that order and the others in
 * message order. The landing page leads with live calling.
 */
export function faqGroups(
  faq: LandingMessages['faq'],
  priority: readonly string[] = ['liveCalling'],
): FaqGroup[] {
  const rank = (id: string) => {
    const index = priority.indexOf(id);
    return index === -1 ? priority.length : index;
  };
  const groups: Array<FaqGroup & { questions: FaqMessage[] }> = faq.groups;
  return groups
    .toSorted((a, b) => rank(a.id) - rank(b.id))
    .map((group) => ({
      ...group,
      questions: group.questions.map(faqQuestion),
    }));
}

/** The feature cards, in the order the landing page shows them. */
const LANDING_FEATURES = [
  { href: '/voice-call', key: 'voiceCalling' },
  { href: '/voice-cloning', key: 'voiceCloneDemo' },
  { key: 'security' },
  { key: 'voiceCloning' },
  { key: 'multiLanguage' },
] as const satisfies ReadonlyArray<{
  href?: string;
  key: keyof LandingMessages['features'];
}>;

export type LandingFeatureKey = (typeof LANDING_FEATURES)[number]['key'];

export function getLandingContent(landing: LandingMessages) {
  return {
    cta: landing.cta,
    faq: {
      groups: faqGroups(landing.faq),
      subtitle: landing.faq.subtitle,
      title: landing.faq.title,
    },
    features: LANDING_FEATURES.map((feature) => ({
      ...feature,
      ...landing.features[feature.key],
    })),
    hero: landing.hero,
    samples: {
      subtitle: landing.popular.trySamplesSubtitle,
      title: landing.popular.trySamplesTitle,
    },
  };
}
