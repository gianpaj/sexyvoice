import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBatch: vi.fn(),
  getBatchOutcomes: vi.fn(),
  uploadBatchInputFile: vi.fn(),
}));

vi.mock('@/lib/ai/xai-batch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/xai-batch')>()),
  createBatch: mocks.createBatch,
  getBatchOutcomes: mocks.getBatchOutcomes,
  uploadBatchInputFile: mocks.uploadBatchInputFile,
}));

import {
  collectCallAnalysisBatchResults,
  createCallAnalysisBatch,
  prepareCallAnalysisBatch,
  prepareCallAnalysisBatchRequest,
  resolveCallAnalysisBatchOutcome,
  submitCallAnalysisBatch,
} from '@/lib/ai/call-analysis-batch';

const analysis = {
  ai_compliance_issues: null,
  conversation_quality: 'flowing',
  key_user_requests: ['a story'],
  language: 'en',
  notable_patterns: null,
  topic_category: 'casual_chat',
  topic_subcategory: 'smalltalk',
  user_engagement_level: 'high',
  user_sentiment: 'engaged',
  where_conversation_died: null,
};

const session = {
  duration_seconds: 200,
  end_reason: 'user_disconnect',
  id: 's1',
  started_at: '2026-01-01T00:00:00Z',
  transcript: [
    { content: 'hello', role: 'assistant' },
    { content: 'tell me a story', role: 'user' },
  ],
  user_id: 'u1',
};

describe('prepareCallAnalysisBatchRequest()', () => {
  it('builds a chat-completions request keyed by the session id', () => {
    const prepared = prepareCallAnalysisBatchRequest(session, 'grok-test');
    if ('error' in prepared) {
      throw new Error(prepared.error);
    }

    expect(prepared.request).toMatchObject({
      body: { model: 'grok-test' },
      custom_id: 's1',
      method: 'POST',
      url: '/v1/chat/completions',
    });
    const [system, user] = prepared.request.body.messages;
    expect(system.role).toBe('system');
    expect(user.content).toContain('USER: tell me a story');
    expect(user.content).toContain('"topic_category"');
    expect(user.content).toContain('Call duration: 200 seconds');
    expect(prepared.context.assistantOnlyNote).toBeNull();
  });

  it('flags assistant-only transcripts and rejects empty ones', () => {
    const prepared = prepareCallAnalysisBatchRequest({
      ...session,
      transcript: [{ content: 'hello', role: 'assistant' }],
    });
    expect('context' in prepared && prepared.context.assistantOnlyNote).toMatch(
      /No user transcription/,
    );

    expect(
      prepareCallAnalysisBatchRequest({ ...session, transcript: [] }),
    ).toEqual({ error: 'No messages in transcript' });
  });
});

describe('resolveCallAnalysisBatchOutcome()', () => {
  const context = { assistantOnlyNote: null, session };

  it('validates the JSON content against the schema', () => {
    expect(
      resolveCallAnalysisBatchOutcome(context, {
        content: `\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``,
        customId: 's1',
        errorMessage: null,
      }),
    ).toEqual({ analysis, sessionId: 's1' });
  });

  it('appends the assistant-only note to notable_patterns', () => {
    const result = resolveCallAnalysisBatchOutcome(
      { assistantOnlyNote: 'No user transcription detected.', session },
      { content: JSON.stringify(analysis), customId: 's1', errorMessage: null },
    );
    expect(result.analysis?.notable_patterns).toBe(
      'No user transcription detected.',
    );
  });

  it('turns missing, errored and off-schema outcomes into retryable errors', () => {
    expect(resolveCallAnalysisBatchOutcome(context, undefined)).toEqual({
      error: 'No batch result returned',
      sessionId: 's1',
    });
    expect(
      resolveCallAnalysisBatchOutcome(context, {
        content: null,
        customId: 's1',
        errorMessage: 'rate limited',
      }),
    ).toEqual({ error: 'rate limited', sessionId: 's1' });
    expect(
      resolveCallAnalysisBatchOutcome(context, {
        content: JSON.stringify({ ...analysis, user_sentiment: 'meh' }),
        customId: 's1',
        errorMessage: null,
      }).error,
    ).toMatch(/^parse failed: /);
    expect(
      resolveCallAnalysisBatchOutcome(context, {
        content: 'not json',
        customId: 's1',
        errorMessage: null,
      }).error,
    ).toMatch(/^parse failed: /);
  });
});

describe('submitCallAnalysisBatch() / collectCallAnalysisBatchResults()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadBatchInputFile.mockResolvedValue('file_1');
    mocks.createBatch.mockResolvedValue('batch_1');
  });

  it('uploads one JSONL file for every analysable session', async () => {
    const empty = { ...session, id: 's2', transcript: [] };

    const submission = await submitCallAnalysisBatch([session, empty], 'm');

    expect(submission.batchId).toBe('batch_1');
    expect(submission.rejected).toEqual([
      { error: 'No messages in transcript', sessionId: 's2' },
    ]);
    if (!submission.batchId) {
      throw new Error('expected a batch');
    }
    expect([...submission.contexts.keys()]).toEqual(['s1']);
    const jsonl = mocks.uploadBatchInputFile.mock.calls[0][0] as string;
    expect(jsonl.trim().split('\n')).toHaveLength(1);
    expect(mocks.createBatch).toHaveBeenCalledWith('call-analysis-1', 'file_1');
  });

  it('exposes prepare and create as separate phases', async () => {
    const prepared = prepareCallAnalysisBatch(
      [session, { ...session, id: 's2', transcript: null }],
      'm',
    );
    expect(prepared.requests.map((r) => r.custom_id)).toEqual(['s1']);
    expect(prepared.rejected).toEqual([
      { error: 'No messages in transcript', sessionId: 's2' },
    ]);
    expect(mocks.uploadBatchInputFile).not.toHaveBeenCalled();

    await expect(createCallAnalysisBatch(prepared.requests)).resolves.toBe(
      'batch_1',
    );
    expect(mocks.createBatch).toHaveBeenCalledWith('call-analysis-1', 'file_1');
  });

  it('skips the upload when nothing is analysable', async () => {
    const submission = await submitCallAnalysisBatch([
      { ...session, transcript: null },
    ]);
    expect(submission.batchId).toBeNull();
    expect(mocks.uploadBatchInputFile).not.toHaveBeenCalled();
  });

  it('maps outcomes back onto every submitted session', async () => {
    mocks.getBatchOutcomes.mockResolvedValue(
      new Map([
        [
          's1',
          {
            content: JSON.stringify(analysis),
            customId: 's1',
            errorMessage: null,
          },
        ],
      ]),
    );
    const contexts = new Map([
      ['s1', { assistantOnlyNote: null, session }],
      ['s3', { assistantOnlyNote: null, session: { ...session, id: 's3' } }],
    ]);

    const results = await collectCallAnalysisBatchResults('batch_1', contexts);

    expect(results).toEqual([
      { analysis, sessionId: 's1' },
      { error: 'No batch result returned', sessionId: 's3' },
    ]);
  });
});
