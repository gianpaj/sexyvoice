import { describe, expect, it } from 'vitest';

import { fitChatBudget } from '@/lib/voice-chat/chat-budget';
import { CHAT_BALANCE_ERROR } from '@/lib/voice-chat/protocol';

const rate = {
  inputTokenLimit: 16_384,
  outputTokenLimit: 1024,
  inputCreditsPerMillion: 50_000,
  outputCreditsPerMillion: 100_000,
};
const user = (content: string) => ({ role: 'user' as const, content });
const assistant = (content: string) => ({
  role: 'assistant' as const,
  content,
});

describe('fitChatBudget', () => {
  it('fits a useful reply within the 780-credit remainder', () => {
    const turns = [user('a'), assistant('x'.repeat(13_500)), user('b')];
    const budget = fitChatBudget(['Character instructions'], turns, {
      ...rate,
      reservedCredits: 780,
    });

    if (!budget || budget === CHAT_BALANCE_ERROR) {
      throw new Error('Expected an affordable reply');
    }
    expect(budget.messages).toEqual(turns);
    expect(budget.maxOutputTokens).toBeGreaterThanOrEqual(750);
    expect(budget.maxOutputTokens).toBeLessThan(1024);
  });

  it('drops whole earlier exchanges and measures non-ASCII input in bytes', () => {
    const recent = [user('Recent'), assistant('Reply'), user('Latest')];
    const turns = [user('🎈'.repeat(1000)), assistant('Earlier'), ...recent];

    expect(
      fitChatBudget(['Character instructions'], turns, {
        ...rate,
        reservedCredits: 50,
      }),
    ).toMatchObject({ messages: recent });
  });

  it('does not generate if the instructions, user turn and reply cannot fit', () => {
    expect(
      fitChatBudget(['Character instructions'], [user('Latest')], {
        ...rate,
        reservedCredits: 5,
      }),
    ).toBe(CHAT_BALANCE_ERROR);
  });
});
