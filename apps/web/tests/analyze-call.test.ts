import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeTranscript,
  buildConversationSummary,
  callAnalysisSchema,
  extractMessages,
  toAnalysisRow,
} from '@/lib/ai/analyze-call';

const generateObjectMock = vi.fn();

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock('@ai-sdk/xai', () => ({
  xai: (modelId: string) => ({ modelId }),
}));

describe('callAnalysisSchema', () => {
  it('defines the complete analysis field set', () => {
    expect(Object.keys(callAnalysisSchema.shape).toSorted()).toEqual([
      'ai_compliance_issues',
      'conversation_quality',
      'key_user_requests',
      'language',
      'notable_patterns',
      'topic_category',
      'topic_subcategory',
      'user_engagement_level',
      'user_sentiment',
      'where_conversation_died',
    ]);
  });
});

describe('extractMessages()', () => {
  it('returns an empty array for null/empty transcripts', () => {
    expect(extractMessages(null)).toEqual([]);
    expect(extractMessages([])).toEqual([]);
  });

  it('handles a bare array of { role, content }', () => {
    const messages = extractMessages([
      { content: 'hi', role: 'assistant', timestamp: '2026-01-01T00:00:01Z' },
      { content: 'hello', role: 'user', timestamp: '2026-01-01T00:00:00Z' },
    ]);
    // sorted chronologically
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].content).toBe('hello');
  });

  it('merges { messages } and { user_transcriptions } shapes', () => {
    const messages = extractMessages({
      messages: [
        {
          role: 'assistant',
          text: 'welcome',
          timestamp: '2026-01-01T00:00:02Z',
        },
      ],
      user_transcriptions: [
        { timestamp: '2026-01-01T00:00:01Z', transcript: 'I need help' },
      ],
    } as never);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ content: 'I need help', role: 'user' });
    expect(messages[1]).toMatchObject({
      content: 'welcome',
      role: 'assistant',
    });
  });

  it('drops empty content', () => {
    const messages = extractMessages([
      { role: 'user' },
      { content: 'ok', role: 'assistant' },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('ok');
  });
});

describe('buildConversationSummary()', () => {
  it('formats USER:/AI: lines and truncates', () => {
    const summary = buildConversationSummary([
      { content: 'hi', role: 'user', timestamp: null },
      { content: 'hello', role: 'assistant', timestamp: null },
    ]);
    expect(summary).toBe('USER: hi\nAI: hello\n');

    const truncated = buildConversationSummary(
      [{ content: 'x'.repeat(100), role: 'user', timestamp: null }],
      20,
    );
    expect(truncated).toContain('[... conversation truncated ...]');
  });
});

describe('toAnalysisRow()', () => {
  it('maps LLM keys to call_session_analysis columns', () => {
    const row = toAnalysisRow(
      {
        duration_seconds: 200,
        end_reason: 'user_disconnect',
        id: 's1',
        started_at: 't',
        transcript: [],
        user_id: 'u1',
      },
      {
        ai_compliance_issues: null,
        conversation_quality: 'flowing',
        key_user_requests: ['tell a joke'],
        language: 'en',
        notable_patterns: null,
        topic_category: 'casual_chat',
        topic_subcategory: 'smalltalk',
        user_engagement_level: 'high',
        user_sentiment: 'engaged',
        where_conversation_died: null,
      },
    );
    expect(row).toMatchObject({
      ai_issues: null,
      engagement_level: 'high',
      error: null,
      key_requests: ['tell a joke'],
      session_id: 's1',
      user_id: 'u1',
      where_died: null,
    });
    expect(typeof row.analyzed_at).toBe('string');
  });
});

describe('analyzeTranscript()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when the transcript has no messages', async () => {
    await expect(
      analyzeTranscript({ id: 's1', transcript: [] }),
    ).rejects.toThrow('No messages');
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('returns the model object and notes missing user transcription', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        ai_compliance_issues: null,
        conversation_quality: 'flowing',
        key_user_requests: [],
        language: 'en',
        notable_patterns: null,
        topic_category: 'casual_chat',
        topic_subcategory: 'smalltalk',
        user_engagement_level: 'medium',
        user_sentiment: 'engaged',
        where_conversation_died: null,
      },
    });

    // assistant-only transcript → notable_patterns should be backfilled
    const result = await analyzeTranscript({
      duration_seconds: 200,
      id: 's1',
      transcript: [{ content: 'hello there', role: 'assistant' }],
    });

    expect(result.language).toBe('en');
    expect(result.notable_patterns).toContain('No user transcription');
    expect(generateObjectMock).toHaveBeenCalledOnce();
  });
});
