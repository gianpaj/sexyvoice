import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeTranscript,
  buildConversationSummary,
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

describe('extractMessages()', () => {
  it('returns an empty array for null/empty transcripts', () => {
    expect(extractMessages(null)).toEqual([]);
    expect(extractMessages([])).toEqual([]);
  });

  it('handles a bare array of { role, content }', () => {
    const messages = extractMessages([
      { role: 'assistant', content: 'hi', timestamp: '2026-01-01T00:00:01Z' },
      { role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00Z' },
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
        { transcript: 'I need help', timestamp: '2026-01-01T00:00:01Z' },
      ],
    } as never);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'I need help' });
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: 'welcome',
    });
  });

  it('drops empty content', () => {
    const messages = extractMessages([
      { role: 'user' },
      { role: 'assistant', content: 'ok' },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('ok');
  });
});

describe('buildConversationSummary()', () => {
  it('formats USER:/AI: lines and truncates', () => {
    const summary = buildConversationSummary([
      { role: 'user', content: 'hi', timestamp: null },
      { role: 'assistant', content: 'hello', timestamp: null },
    ]);
    expect(summary).toBe('USER: hi\nAI: hello\n');

    const truncated = buildConversationSummary(
      [{ role: 'user', content: 'x'.repeat(100), timestamp: null }],
      20,
    );
    expect(truncated).toContain('[... conversation truncated ...]');
  });
});

describe('toAnalysisRow()', () => {
  it('maps LLM keys to call_session_analysis columns', () => {
    const row = toAnalysisRow(
      {
        id: 's1',
        user_id: 'u1',
        started_at: 't',
        duration_seconds: 200,
        end_reason: 'user_disconnect',
        transcript: [],
      },
      {
        language: 'en',
        topic_category: 'casual_chat',
        topic_subcategory: 'smalltalk',
        user_engagement_level: 'high',
        conversation_quality: 'flowing',
        where_conversation_died: null,
        user_sentiment: 'engaged',
        key_user_requests: ['tell a joke'],
        ai_compliance_issues: null,
        notable_patterns: null,
      },
    );
    expect(row).toMatchObject({
      session_id: 's1',
      user_id: 'u1',
      engagement_level: 'high',
      where_died: null,
      key_requests: ['tell a joke'],
      ai_issues: null,
      error: null,
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
        language: 'en',
        topic_category: 'casual_chat',
        topic_subcategory: 'smalltalk',
        user_engagement_level: 'medium',
        conversation_quality: 'flowing',
        where_conversation_died: null,
        user_sentiment: 'engaged',
        key_user_requests: [],
        ai_compliance_issues: null,
        notable_patterns: null,
      },
    });

    // assistant-only transcript → notable_patterns should be backfilled
    const result = await analyzeTranscript({
      id: 's1',
      duration_seconds: 200,
      transcript: [{ role: 'assistant', content: 'hello there' }],
    });

    expect(result.language).toBe('en');
    expect(result.notable_patterns).toContain('No user transcription');
    expect(generateObjectMock).toHaveBeenCalledOnce();
  });
});
