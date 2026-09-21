import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  collectCallAnalysisBatchResults: vi.fn(),
  getBatchState: vi.fn(),
  queries: {
    getAnalyzedSessionIds: vi.fn(),
    getInFlightCallAnalysisBatches: vi.fn(),
    getPendingCallAnalyses: vi.fn(),
    getSubmittedCallAnalysesForBatch: vi.fn(),
    markCallAnalysesCompleted: vi.fn(),
    markCallAnalysesSubmitted: vi.fn(),
    markCallAnalysisFailed: vi.fn(),
    upsertCallSessionAnalysis: vi.fn(),
  },
  submitCallAnalysisBatch: vi.fn(),
  waitForBatch: vi.fn(),
}));

vi.unmock('next/server');

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ client: 'admin' }),
}));
vi.mock('@/lib/supabase/call-analysis-queries', () => ({
  ...mocks.queries,
  MAX_CALL_ANALYSIS_ATTEMPTS: 3,
}));
vi.mock('@/lib/ai/call-analysis-batch', () => ({
  collectCallAnalysisBatchResults: mocks.collectCallAnalysisBatchResults,
  submitCallAnalysisBatch: mocks.submitCallAnalysisBatch,
}));
vi.mock('@/lib/ai/xai-batch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/xai-batch')>()),
  getBatchState: mocks.getBatchState,
  waitForBatch: mocks.waitForBatch,
}));

import { GET } from '@/app/api/call-sessions/analyze/batch/route';

const analysis = {
  ai_compliance_issues: null,
  conversation_quality: 'flowing',
  key_user_requests: [],
  language: 'en',
  notable_patterns: null,
  topic_category: 'casual_chat',
  topic_subcategory: 'smalltalk',
  user_engagement_level: 'high',
  user_sentiment: 'engaged',
  where_conversation_died: null,
};

function queueRow(sessionId: string, attempts = 1, batchId = 'batch_1') {
  return {
    attempts,
    call_sessions: {
      duration_seconds: 200,
      end_reason: 'user_disconnect',
      id: sessionId,
      started_at: '2026-01-01T00:00:00Z',
      transcript: [
        { content: 'hello', role: 'assistant' },
        { content: 'hi', role: 'user' },
      ],
      user_id: 'u1',
    },
    session_id: sessionId,
    submitted_at: '2026-01-01T00:00:00Z',
    xai_batch_id: batchId,
  };
}

function request(authorization?: string) {
  return new NextRequest('http://localhost/api/call-sessions/analyze/batch', {
    headers: authorization ? { authorization } : undefined,
  });
}

describe('GET /api/call-sessions/analyze/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.queries.getInFlightCallAnalysisBatches.mockResolvedValue([]);
    mocks.queries.getPendingCallAnalyses.mockResolvedValue([]);
    mocks.queries.getAnalyzedSessionIds.mockResolvedValue(new Set());
    mocks.queries.markCallAnalysisFailed.mockImplementation(
      (_client, _id, _error, { retry }: { retry: boolean }) =>
        Promise.resolve(retry ? 'pending' : 'failed'),
    );
    mocks.waitForBatch.mockResolvedValue({ settled: false, state: {} });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('requires CRON_SECRET in production', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('Bearer wrong'))).status).toBe(401);
    expect(mocks.queries.getPendingCallAnalyses).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing is queued or in flight', async () => {
    const res = await GET(request('Bearer cron-secret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reconciled: { pending: [], settled: [] },
      submitted: { batchId: null, sessions: 0, settled: null, skipped: 0 },
    });
    expect(mocks.submitCallAnalysisBatch).not.toHaveBeenCalled();
  });

  it('settles a finished batch: writes analyses, retries and parks failures', async () => {
    mocks.queries.getInFlightCallAnalysisBatches.mockResolvedValue([
      { batchId: 'batch_1', submittedAt: '2026-01-01T00:00:00Z' },
    ]);
    mocks.getBatchState.mockResolvedValue({ num_pending: 0, num_requests: 3 });
    mocks.queries.getSubmittedCallAnalysesForBatch.mockResolvedValue([
      queueRow('s-ok'),
      queueRow('s-retry', 1),
      queueRow('s-final', 3),
    ]);
    mocks.collectCallAnalysisBatchResults.mockResolvedValue([
      { analysis, sessionId: 's-ok' },
      { error: 'parse failed: bad json', sessionId: 's-retry' },
      { error: 'model error', sessionId: 's-final' },
    ]);

    const res = await GET(request('Bearer cron-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reconciled).toEqual({
      pending: [],
      settled: [{ batchId: 'batch_1', completed: 1, failed: 1, retried: 1 }],
    });
    expect(mocks.queries.upsertCallSessionAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 's-ok' }),
      analysis,
    );
    expect(mocks.queries.markCallAnalysesCompleted).toHaveBeenCalledWith(
      expect.anything(),
      ['s-ok'],
    );
    expect(mocks.queries.markCallAnalysisFailed).toHaveBeenCalledWith(
      expect.anything(),
      's-retry',
      'parse failed: bad json',
      { retry: true },
    );
    expect(mocks.queries.markCallAnalysisFailed).toHaveBeenCalledWith(
      expect.anything(),
      's-final',
      'model error',
      { retry: false },
    );
    // Contexts are rebuilt from the queue rows' sessions.
    const contexts = mocks.collectCallAnalysisBatchResults.mock.calls[0][1];
    expect([...contexts.keys()]).toEqual(['s-ok', 's-retry', 's-final']);
  });

  it('leaves unsettled batches alone and flags stale ones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    mocks.queries.getInFlightCallAnalysisBatches.mockResolvedValue([
      { batchId: 'batch_old', submittedAt: '2026-01-01T00:00:00Z' },
      { batchId: 'batch_new', submittedAt: '2026-01-02T23:00:00Z' },
    ]);
    mocks.getBatchState.mockResolvedValue({ num_pending: 2, num_requests: 2 });

    const res = await GET(request('Bearer cron-secret'));
    const body = await res.json();

    expect(body.reconciled.pending).toEqual(['batch_old', 'batch_new']);
    expect(
      mocks.queries.getSubmittedCallAnalysesForBatch,
    ).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalledOnce();
    expect(mocks.captureMessage.mock.calls[0][1]).toMatchObject({
      extra: { batchId: 'batch_old' },
    });
    vi.useRealTimers();
  });

  it('coalesces pending rows into one batch and marks them submitted', async () => {
    const rows = [
      { ...queueRow('s1', 0, null as unknown as string), xai_batch_id: null },
      { ...queueRow('s2', 0, null as unknown as string), xai_batch_id: null },
      {
        ...queueRow('s-done', 0, null as unknown as string),
        xai_batch_id: null,
      },
      {
        ...queueRow('s-empty', 0, null as unknown as string),
        xai_batch_id: null,
      },
    ];
    mocks.queries.getPendingCallAnalyses.mockResolvedValue(rows);
    mocks.queries.getAnalyzedSessionIds.mockResolvedValue(new Set(['s-done']));
    mocks.submitCallAnalysisBatch.mockResolvedValue({
      batchId: 'batch_2',
      contexts: new Map([
        ['s1', {}],
        ['s2', {}],
      ]),
      rejected: [{ error: 'No messages in transcript', sessionId: 's-empty' }],
    });

    const res = await GET(request('Bearer cron-secret'));
    const body = await res.json();

    expect(body.submitted).toEqual({
      batchId: 'batch_2',
      sessions: 2,
      settled: null,
      skipped: 2,
    });
    // Already-analysed rows are closed without spending batch requests.
    expect(mocks.queries.markCallAnalysesCompleted).toHaveBeenCalledWith(
      expect.anything(),
      ['s-done'],
    );
    const submittedSessions = mocks.submitCallAnalysisBatch.mock.calls[0][0];
    expect(submittedSessions.map((s: { id: string }) => s.id)).toEqual([
      's1',
      's2',
      's-empty',
    ]);
    expect(mocks.queries.markCallAnalysisFailed).toHaveBeenCalledWith(
      expect.anything(),
      's-empty',
      'No messages in transcript',
      { retry: false },
    );
    expect(mocks.queries.markCallAnalysesSubmitted).toHaveBeenCalledWith(
      expect.anything(),
      [rows[0], rows[1]],
      'batch_2',
    );
    expect(mocks.waitForBatch).toHaveBeenCalledWith(
      'batch_2',
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it('settles the new batch in the same run when it finishes quickly', async () => {
    const row = { ...queueRow('s1', 0), xai_batch_id: null };
    mocks.queries.getPendingCallAnalyses.mockResolvedValue([row]);
    mocks.submitCallAnalysisBatch.mockResolvedValue({
      batchId: 'batch_3',
      contexts: new Map([['s1', {}]]),
      rejected: [],
    });
    mocks.waitForBatch.mockResolvedValue({ settled: true, state: {} });
    mocks.queries.getSubmittedCallAnalysesForBatch.mockResolvedValue([
      queueRow('s1', 1, 'batch_3'),
    ]);
    mocks.collectCallAnalysisBatchResults.mockResolvedValue([
      { analysis, sessionId: 's1' },
    ]);

    const body = await (await GET(request('Bearer cron-secret'))).json();

    expect(body.submitted.settled).toEqual({
      batchId: 'batch_3',
      completed: 1,
      failed: 0,
      retried: 0,
    });
    expect(mocks.queries.upsertCallSessionAnalysis).toHaveBeenCalledOnce();
  });

  it('returns 500 and reports to Sentry when the drain fails', async () => {
    mocks.queries.getInFlightCallAnalysisBatches.mockRejectedValue(
      new Error('db down'),
    );

    const res = await GET(request('Bearer cron-secret'));

    expect(res.status).toBe(500);
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
});
