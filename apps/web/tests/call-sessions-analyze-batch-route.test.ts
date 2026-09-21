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
      reconciled: {
        error: null,
        result: {
          abandoned: [],
          failed: [],
          pending: [],
          recycled: 0,
          settled: [],
        },
      },
      submitted: {
        error: null,
        result: { batchId: null, sessions: 0, settled: null, skipped: 0 },
      },
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
    expect(body.reconciled.result).toEqual({
      abandoned: [],
      failed: [],
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

    expect(body.reconciled.result.pending).toEqual(['batch_old', 'batch_new']);
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

    expect(body.submitted.result).toEqual({
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

    expect(body.submitted.result.sessions).toBe(1);
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

    expect(body.submitted.result).toEqual({
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

    expect(body.submitted.result.settled).toEqual({
      batchId: 'batch_3',
      completed: 1,
      failed: 0,
      retried: 0,
    });
    expect(mocks.queries.upsertCallSessionAnalysis).toHaveBeenCalledOnce();
  });

  it('isolates a batch whose state lookup fails and keeps draining the rest', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T02:00:00Z'));
    mocks.queries.getInFlightCallAnalysisBatches.mockResolvedValue([
      { batchId: 'batch_bad', submittedAt: '2026-01-01T01:00:00Z' },
      { batchId: 'batch_ok', submittedAt: '2026-01-01T01:30:00Z' },
    ]);
    mocks.getBatchState.mockImplementation((batchId: string) =>
      batchId === 'batch_bad'
        ? Promise.reject(new Error('404 not found'))
        : Promise.resolve({ num_pending: 0, num_requests: 1 }),
    );
    mocks.queries.getSubmittedCallAnalysesForBatch.mockResolvedValue([
      queueRow('s1', 1, 'batch_ok'),
    ]);
    mocks.collectCallAnalysisBatchResults.mockResolvedValue([
      { analysis, sessionId: 's1' },
    ]);
    mocks.queries.getPendingCallAnalyses.mockResolvedValue([
      { ...queueRow('s-new', 0), xai_batch_id: null },
    ]);
    mocks.createCallAnalysisBatch.mockResolvedValue('batch_new');

    const res = await GET(request('Bearer cron-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reconciled.result.failed).toEqual(['batch_bad']);
    expect(body.reconciled.result.settled).toEqual([
      { batchId: 'batch_ok', completed: 1, failed: 0, retried: 0 },
    ]);
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: { batchId: 'batch_bad' } }),
    );
    // New work still goes out.
    expect(body.submitted.result.batchId).toBe('batch_new');
    vi.useRealTimers();
  });

  it('abandons a batch that has not settled after 48h, retrying rows via attempts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-04T00:00:00Z'));
    mocks.queries.getInFlightCallAnalysisBatches.mockResolvedValue([
      { batchId: 'batch_dead', submittedAt: '2026-01-01T00:00:00Z' },
    ]);
    mocks.getBatchState.mockResolvedValue({ num_pending: 2, num_requests: 2 });
    mocks.queries.getSubmittedCallAnalysesForBatch.mockResolvedValue([
      queueRow('s-retry', 1, 'batch_dead'),
      queueRow('s-final', 3, 'batch_dead'),
    ]);

    const body = await (await GET(request('Bearer cron-secret'))).json();

    expect(body.reconciled.result.abandoned).toEqual(['batch_dead']);
    expect(body.reconciled.result.pending).toEqual([]);
    expect(mocks.queries.markCallAnalysisFailed).toHaveBeenCalledWith(
      expect.anything(),
      's-retry',
      expect.stringContaining('batch_dead'),
      { retry: true },
    );
    expect(mocks.queries.markCallAnalysisFailed).toHaveBeenCalledWith(
      expect.anything(),
      's-final',
      expect.stringContaining('batch_dead'),
      { retry: false },
    );
    expect(mocks.collectCallAnalysisBatchResults).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('parks pending rows whose call session is gone instead of re-selecting them', async () => {
    mocks.queries.getPendingCallAnalyses.mockResolvedValue([
      { ...queueRow('s-gone', 0), call_sessions: null, xai_batch_id: null },
      { ...queueRow('s1', 0), xai_batch_id: null },
    ]);
    mocks.createCallAnalysisBatch.mockResolvedValue('batch_5');

    const body = await (await GET(request('Bearer cron-secret'))).json();

    expect(mocks.queries.markCallAnalysisFailed).toHaveBeenCalledWith(
      expect.anything(),
      's-gone',
      'Call session no longer available',
      { retry: false },
    );
    expect(body.submitted.result).toMatchObject({
      batchId: 'batch_5',
      sessions: 1,
      skipped: 1,
    });
  });

  it('runs the submit phase even when reconcile fails, and reports 500', async () => {
    mocks.queries.getInFlightCallAnalysisBatches.mockRejectedValue(
      new Error('db down'),
    );
    mocks.queries.getPendingCallAnalyses.mockResolvedValue([
      { ...queueRow('s1', 0), xai_batch_id: null },
    ]);
    mocks.createCallAnalysisBatch.mockResolvedValue('batch_6');

    const res = await GET(request('Bearer cron-secret'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.reconciled).toEqual({
      error: 'Reconcile failed',
      result: null,
    });
    expect(body.submitted.result.batchId).toBe('batch_6');
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: { phase: 'reconcile' } }),
    );
  });
});
