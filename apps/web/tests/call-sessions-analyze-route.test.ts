import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyzeTranscript: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  enqueueCallAnalysis: vi.fn(),
  hasCallSessionAnalysis: vi.fn(),
  maybeSingle: vi.fn(),
  upsertCallSessionAnalysis: vi.fn(),
}));

// Exercise real request parsing and response codes, not the setup mock.
vi.unmock('next/server');

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }),
  }),
}));
vi.mock('@/lib/supabase/call-analysis-queries', () => ({
  enqueueCallAnalysis: mocks.enqueueCallAnalysis,
  hasCallSessionAnalysis: mocks.hasCallSessionAnalysis,
  upsertCallSessionAnalysis: mocks.upsertCallSessionAnalysis,
}));
vi.mock('@/lib/ai/analyze-call', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/analyze-call')>()),
  analyzeTranscript: mocks.analyzeTranscript,
}));

import { POST } from '@/app/api/call-sessions/analyze/route';

const SECRET = 'webhook-secret';

const eligibleSession = {
  duration_seconds: 300,
  end_reason: 'user_disconnect',
  id: 'session-1',
  started_at: '2026-01-01T00:00:00Z',
  status: 'completed',
  transcript: [
    { content: 'hello', role: 'assistant' },
    { content: 'hi', role: 'user' },
  ],
  user_id: 'user-1',
};

function request(body: unknown, authorization = `Bearer ${SECRET}`) {
  return new NextRequest('http://localhost/api/call-sessions/analyze', {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { authorization, 'content-type': 'application/json' },
    method: 'POST',
  });
}

describe('POST /api/call-sessions/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CALL_SUMMARY_SECRET', SECRET);
    vi.stubEnv('CALL_ANALYSIS_REALTIME', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.maybeSingle.mockResolvedValue({ data: eligibleSession, error: null });
    mocks.hasCallSessionAnalysis.mockResolvedValue(false);
    mocks.enqueueCallAnalysis.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects requests without the shared secret', async () => {
    const res = await POST(request({ id: 'session-1' }, 'Bearer nope'));
    expect(res.status).toBe(401);
    expect(mocks.enqueueCallAnalysis).not.toHaveBeenCalled();
  });

  it('fails closed when the secret is not configured', async () => {
    vi.stubEnv('CALL_SUMMARY_SECRET', '');
    const res = await POST(request({ id: 'session-1' }, 'Bearer undefined'));
    expect(res.status).toBe(500);
    expect(mocks.captureMessage).toHaveBeenCalledOnce();
  });

  it('validates the body', async () => {
    expect((await POST(request('{'))).status).toBe(400);
    expect((await POST(request({}))).status).toBe(400);
  });

  it('enqueues an eligible session and responds 202 without calling the LLM', async () => {
    const res = await POST(request({ id: 'session-1' }));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ queued: true });
    expect(mocks.enqueueCallAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      'session-1',
    );
    expect(mocks.analyzeTranscript).not.toHaveBeenCalled();
    expect(mocks.upsertCallSessionAnalysis).not.toHaveBeenCalled();
  });

  it('skips ineligible sessions and sessions that already have an analysis', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { ...eligibleSession, duration_seconds: 30 },
      error: null,
    });
    let res = await POST(request({ id: 'session-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: true });

    mocks.hasCallSessionAnalysis.mockResolvedValueOnce(true);
    res = await POST(request({ id: 'session-1' }));
    expect(await res.json()).toEqual({ skipped: true });

    expect(mocks.enqueueCallAnalysis).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown session', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request({ id: 'missing' }))).status).toBe(404);
  });

  it('reports enqueue failures without persisting anything', async () => {
    mocks.enqueueCallAnalysis.mockRejectedValueOnce(new Error('db down'));

    const res = await POST(request({ id: 'session-1' }));

    expect(res.status).toBe(500);
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it('analyses inline when CALL_ANALYSIS_REALTIME=true', async () => {
    vi.stubEnv('CALL_ANALYSIS_REALTIME', 'true');
    const analysis = { language: 'en' };
    mocks.analyzeTranscript.mockResolvedValueOnce(analysis);

    const res = await POST(request({ id: 'session-1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.enqueueCallAnalysis).not.toHaveBeenCalled();
    expect(mocks.upsertCallSessionAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      eligibleSession,
      analysis,
    );
  });

  it('leaves no analysis row when the inline analysis fails', async () => {
    vi.stubEnv('CALL_ANALYSIS_REALTIME', 'true');
    mocks.analyzeTranscript.mockRejectedValueOnce(new Error('model down'));

    const res = await POST(request({ id: 'session-1' }));

    expect(res.status).toBe(500);
    expect(mocks.upsertCallSessionAnalysis).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
});
