import { beforeEach, describe, expect, it } from 'vitest';

import { saveAllSessionAnalyses } from '../../../scripts/analyze-call-sessions.mjs';

// How the analysis scripts record results in call_analysis_queue and
// call_session_analysis.

interface Write {
  filter?: unknown;
  options?: unknown;
  rows: unknown;
  table: string;
}

let queueRows: { attempts: number; session_id: string; status: string }[];
let writes: Write[];

const client = {
  from: (table: string) => ({
    select: () => ({
      in: async (_column: string, ids: string[]) => ({
        data: queueRows.filter((row) => ids.includes(row.session_id)),
        error: null,
      }),
    }),
    update: (rows: unknown) => ({
      in: async (_column: string, ids: string[]) => {
        writes.push({ filter: ids, rows, table });
        return { error: null };
      },
    }),
    upsert: async (rows: unknown, options?: unknown) => {
      writes.push({ options, rows, table });
      return { error: null };
    },
  }),
};

const analysis = {
  ai_compliance_issues: null,
  conversation_quality: 'flowing',
  key_user_requests: ['story'],
  language: 'en',
  notable_patterns: null,
  topic_category: 'casual_chat',
  topic_subcategory: 'chat',
  user_engagement_level: 'high',
  user_sentiment: 'engaged',
  where_conversation_died: null,
};

const session = (id: string) => ({
  duration_seconds: 300,
  end_reason: null,
  id,
  started_at: '2026-11-01T00:00:00.000Z',
  transcript: null,
  user_id: 'user',
});

const failure = (id: string, final?: boolean) => ({
  error: 'parse failed',
  final,
  session: session(id),
  sessionId: id,
});

beforeEach(() => {
  queueRows = [];
  writes = [];
});

describe('analysis scripts', () => {
  it('saves a successful analysis once and completes its queue row', async () => {
    const counts = await saveAllSessionAnalyses(client, [
      { analysis, session: session('done'), sessionId: 'done' },
    ]);

    expect(counts).toEqual({ errorCount: 0, skippedCount: 0, successCount: 1 });
    expect(writes).toEqual([
      {
        options: { ignoreDuplicates: true, onConflict: 'session_id' },
        rows: expect.objectContaining({
          duration_seconds: 300,
          session_id: 'done',
          topic_category: 'casual_chat',
          user_id: 'user',
        }),
        table: 'call_session_analysis',
      },
      {
        filter: ['done'],
        rows: expect.objectContaining({ status: 'completed' }),
        table: 'call_analysis_queue',
      },
    ]);
  });

  it('queues a failure for the cron until the last attempt parks it', async () => {
    queueRows = [
      { attempts: 1, session_id: 'parked', status: 'failed' },
      { attempts: 2, session_id: 'last-try', status: 'failed' },
      { attempts: 1, session_id: 'queued', status: 'pending' },
      { attempts: 1, session_id: 'in-batch', status: 'submitted' },
    ];

    const counts = await saveAllSessionAnalyses(client, [
      failure('new'),
      failure('parked'),
      failure('last-try'),
      failure('queued'),
      failure('in-batch'),
      failure('no-transcript', true),
    ]);

    expect(counts).toEqual({ errorCount: 0, skippedCount: 6, successCount: 0 });
    const upsert = writes.find(({ options }) => options);
    expect(upsert?.table).toBe('call_analysis_queue');
    expect(upsert?.options).toEqual({ onConflict: 'session_id' });
    expect(upsert?.rows).toEqual([
      expect.objectContaining({
        attempts: 1,
        last_error: 'parse failed',
        session_id: 'new',
        status: 'pending',
      }),
      expect.objectContaining({
        attempts: 2,
        session_id: 'parked',
        status: 'pending',
      }),
      expect.objectContaining({
        attempts: 3,
        session_id: 'last-try',
        status: 'failed',
      }),
      expect.objectContaining({
        attempts: 1,
        session_id: 'no-transcript',
        status: 'failed',
      }),
    ]);
  });
});
