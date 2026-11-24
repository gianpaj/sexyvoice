import { CHAT_BALANCE_ERROR } from './protocol';

interface Turn {
  content: string;
  role: 'user' | 'assistant';
}

interface Budget {
  inputCreditsPerMillion: number;
  inputTokenLimit: number;
  outputCreditsPerMillion: number;
  outputTokenLimit: number;
  reservedCredits: number;
}

const MIN_OUTPUT_TOKENS = 32;

export function fitChatBudget(
  systemPrompts: string[],
  turns: Turn[],
  budget: Budget,
):
  | { messages: Turn[]; maxOutputTokens: number }
  | typeof CHAT_BALANCE_ERROR
  | null {
  const encoder = new TextEncoder();
  const upperBound = (message: { role: string; content: string }) =>
    encoder.encode(JSON.stringify(message)).length + 32;
  // UTF-8 bounds byte-based text tokens. The extra space covers per-message
  // framing and the provider's request and assistant prefix.
  let inputTokens =
    256 +
    systemPrompts.reduce(
      (total, content) => total + upperBound({ role: 'system', content }),
      0,
    );
  const latest = turns.at(-1);
  if (latest?.role !== 'user') return null;
  inputTokens += upperBound(latest);

  const available = budget.reservedCredits * 1_000_000;
  const inputLimit = Math.min(
    budget.inputTokenLimit,
    Math.floor(
      (available - MIN_OUTPUT_TOKENS * budget.outputCreditsPerMillion) /
        budget.inputCreditsPerMillion,
    ),
  );
  if (inputTokens > budget.inputTokenLimit) return null;
  if (inputTokens > inputLimit) return CHAT_BALANCE_ERROR;

  // Keep a contiguous suffix starting at a user turn. Never retain the tail
  // of an older exchange without the user turn it answered.
  let start = turns.length - 1;
  let tailTokens = 0;
  for (let index = start - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    tailTokens += upperBound(turn);
    if (inputTokens + tailTokens > inputLimit) break;
    if (turn.role === 'user') {
      start = index;
      inputTokens += tailTokens;
      tailTokens = 0;
    }
  }
  return {
    messages: turns.slice(start),
    maxOutputTokens: Math.min(
      budget.outputTokenLimit,
      Math.floor(
        (available - inputTokens * budget.inputCreditsPerMillion) /
          budget.outputCreditsPerMillion,
      ),
    ),
  };
}
