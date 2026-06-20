import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeTranscript, summarizeCall } from '@/lib/ai/summarize-call';

const generateObjectMock = vi.fn();

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock('@ai-sdk/xai', () => ({
  xai: (modelId: string) => ({ modelId }),
}));

describe('normalizeTranscript()', () => {
  it('returns an empty string for null or empty transcripts', () => {
    expect(normalizeTranscript(null)).toBe('');
    expect(normalizeTranscript([])).toBe('');
  });

  it('handles { role, content } turns', () => {
    const transcript = [
      { role: 'user', content: 'Hello there' },
      { role: 'assistant', content: 'Hi, how can I help?' },
    ];
    expect(normalizeTranscript(transcript)).toBe(
      'user: Hello there\nassistant: Hi, how can I help?',
    );
  });

  it('handles { role, text } and { speaker } shapes', () => {
    const transcript = [
      { role: 'user', text: 'one' },
      { speaker: 'agent', text: 'two' },
    ];
    expect(normalizeTranscript(transcript)).toBe('user: one\nagent: two');
  });

  it('handles plain string turns and array content parts', () => {
    const transcript = [
      'just a string',
      { role: 'assistant', content: [{ text: 'part a' }, 'part b'] },
    ];
    expect(normalizeTranscript(transcript)).toBe(
      'just a string\nassistant: part a part b',
    );
  });

  it('skips turns with no usable text', () => {
    const transcript = [{ role: 'user' }, { role: 'assistant', content: 'ok' }];
    expect(normalizeTranscript(transcript)).toBe('assistant: ok');
  });
});

describe('summarizeCall()', () => {
  const originalModelEnv = process.env.XAI_SUMMARY_MODEL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalModelEnv === undefined) {
      process.env.XAI_SUMMARY_MODEL = undefined;
    } else {
      process.env.XAI_SUMMARY_MODEL = originalModelEnv;
    }
  });

  it('throws on an empty transcript', async () => {
    await expect(summarizeCall([])).rejects.toThrow('empty transcript');
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('returns the model output with a meta block', async () => {
    process.env.XAI_SUMMARY_MODEL = 'grok-test-model';
    generateObjectMock.mockResolvedValue({
      object: {
        title: 'Test call',
        summary: 'A short summary.',
        key_points: ['point a'],
        sentiment: 'positive',
        action_items: [],
      },
    });

    const result = await summarizeCall([{ role: 'user', content: 'hi' }]);

    expect(result.title).toBe('Test call');
    expect(result.sentiment).toBe('positive');
    expect(result.meta.model).toBe('grok-test-model');
    expect(typeof result.meta.generated_at).toBe('string');
    expect(generateObjectMock).toHaveBeenCalledOnce();
  });
});
