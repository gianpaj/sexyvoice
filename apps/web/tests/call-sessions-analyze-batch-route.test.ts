import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  collectCallAnalysisBatchResults: vi.fn(),
  createCallAnalysisBatch: vi.fn(),
  getBatchState: vi.fn(),
  queries: {
    claimPendingCallAnalyses: vi.fn(),
    getAnalyzedSessionIds: vi.fn(),
    getInFlightCallAnalysisBatches: vi.fn(),
    getPendingCallAnalyses: vi.fn(),
    getSubmittedCallAnalysesForBatch: vi.fn(),
    markCallAnalysesCompleted: vi.fn(),
    markCallAnalysisFailed: vi.fn(),
    releaseCallAnalysisClaims: vi.fn(),
    releaseStaleCallAnalysisClaims: vi.fn(),
    setCallAnalysisBatchId: vi.fn(),
    upsertCallSessionAnalysis: vi.fn(),
  },
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
// Keep the pure prepare phase real so the route is exercised against actual
// prompt building; only the paid xAI call is mocked.
vi.mock('@/lib/ai/call-analysis-batch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/call-analysis-batch')>()),
  collectCallAnalysisBatchResults: mocks.collectCallAnalysisBatchResults,
  createCallAnalysisBatch: mocks.createCallAnalysisBatch,
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
    mocks.queries.releaseStaleCallAnalysisClaims.mockResolvedValue([]);
    // Default claim: every offered row is claimed.
    mocks.queries.claimPendingCallAnalyses.mockImplementation(
      (_client, rows: Array<{ session_id: string }>) =>
        Promise.resolve(rows.map((row) => row.session_id)),
    );
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

  it('fails closed when CRON_SECRET is unset instead of accepting "Bearer undefined"', async () => {
    vi.stubEnv('CRON_SECRET', '');

    const res = await GET(request('Bearer undefined'));

    expect(res.status).toBe(500);
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      'CRON_SECRET is not configured',
    );
    expect(mocks.queries.getPendingCallAnalyses).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing is queued or in flight', async () => {
    const res = await GET(request('Bearer cron-secret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reconciled: { pending: [], recycled: 0, settled: [] },
      submitted: { batchId: null, sessions: 0, settled: null, skipped: 0 },
    });
    expect(mocks.createCallAnalysisBatch).not.toHaveBeenCalled();
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
      recycled: 0,
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

  it('coalesces pending rows into one batch, claiming them before the xAI call', async () => {
    const rows = [
      { ...queueRow('s1', 0), xai_batch_id: null },
      { ...queueRow('s2', 0), xai_batch_id: null },
      { ...queueRow('s-done', 0), xai_batch_id: null },
      { ...queueRow('s-empty', 0), xai_batch_id: null },
    ];
    rows[3].call_sessions.transcript = [];
    mocks.queries.getPendingCallAnalyses.mockResolvedValue(rows);
    mocks.queries.getAnalyzedSessionIds.mockResolvedValue(new Set(['s-done']));
    mocks.createCallAnalysisBatch.mockResolvedValue('batch_2');

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
    // Sessions with no usable transcript are parked as failed.
    expect(mocks.queries.markCallAnalysisFailed).toHaveBeenCalledWith(
      expect.anything(),
      's-empty',
      'No messages in transcript',
      { retry: false },
    );
    // Claim happens first, on exactly the analysable rows...
    expect(mocks.queries.claimPendingCallAnalyses).toHaveBeenCalledWith(
      expect.anything(),
      [rows[0], rows[1]],
    );
    expect(
      mocks.queries.claimPendingCallAnalyses.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.createCallAnalysisBatch.mock.invocationCallOrder[0]);
    // ...then the batch is created from the claimed requests only...
    const requests = mocks.createCallAnalysisBatch.mock.calls[0][0];
    expect(requests.map((r: { custom_id: string }) => r.custom_id)).toEqual([
      's1',
      's2',
    ]);
    // ...and the batch id is attached afterwards.
    expect(mocks.queries.setCallAnalysisBatchId).toHaveBeenCalledWith(
      expect.anything(),
      ['s1', 's2'],
      'batch_2',
    );
    expect(mocks.queries.releaseCallAnalysisClaims).not.toHaveBeenCalled();
    expect(mocks.waitForBatch).toHaveBeenCalledWith(
      'batch_2',
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it('only submits rows the compare-and-set claim actually won', async () => {
    mocks.queries.getPendingCallAnalyses.mockResolvedValue([
      { ...queueRow('s1', 0), xai_batch_id: null },
      { ...queueRow('s2', 0), xai_batch_id: null },
    ]);
    // An overlapping run already claimed s2.
    mocks.queries.claimPendingCallAnalyses.mockResolvedValue(['s1']);
    mocks.createCallAnalysisBatch.mockResolvedValue('batch_4');

    const body = await (await GET(request('Bearer cron-secret'))).json();

    expect(body.submitted.sessions).toBe(1);
    const requests = mocks.createCallAnalysisBatch.mock.calls[0][0];
    expect(requests.map((r: { custom_id: string }) => r.custom_id)).toEqual([
      's1',
    ]);
    expect(mocks.queries.setCallAnalysisBatchId).toHaveBeenCalledWith(
      expect.anything(),
      ['s1'],
      'batch_4',
    );
  });

  it('skips the xAI call entirely when the claim wins nothing', async () => {
    mocks.queries.getPendingCallAnalyses.mockResolvedValue([
      { ...queueRow('s1', 0), xai_batch_id: null },
    ]);
    mocks.queries.claimPendingCallAnalyses.mockResolvedValue([]);

    const body = await (await GET(request('Bearer cron-secret'))).json();

    expect(body.submitted).toEqual({
      batchId: null,
      sessions: 0,
      settled: null,
      skipped: 0,
    });
    expect(mocks.createCallAnalysisBatch).not.toHaveBeenCalled();
  });

  it('releases the claims and reports 500 when the batch cannot be created', async () => {
    mocks.queries.getPendingCallAnalyses.mockResolvedValue([
      { ...queueRow('s1', 0), xai_batch_id: null },
    ]);
    mocks.createCallAnalysisBatch.mockRejectedValue(new Error('upload failed'));

    const res = await GET(request('Bearer cron-secret'));

    expect(res.status).toBe(500);
    expect(mocks.queries.releaseCallAnalysisClaims).toHaveBeenCalledWith(
      expect.anything(),
      ['s1'],
      'upload failed',
    );
    expect(mocks.queries.setCallAnalysisBatchId).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it('settles the new batch in the same run when it finishes quickly', async () => {
    const row = { ...queueRow('s1', 0), xai_batch_id: null };
    mocks.queries.getPendingCallAnalyses.mockResolvedValue([row]);
    mocks.createCallAnalysisBatch.mockResolvedValue('batch_3');
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
