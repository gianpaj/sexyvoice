import { beforeEach, describe, expect, it } from 'vitest';

import { saveAllSessionAnalyses } from '../../../scripts/analyze-call-sessions.mjs';

// How the analysis scripts record results in call_analysis_queue and
// call_session_analysis.

interface Write {
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

const failure = (sessionId: string) => ({ error: 'parse failed', sessionId });

beforeEach(() => {
  queueRows = [];
  writes = [];
});

describe('analysis scripts', () => {
  it('saves a successful analysis once per session', async () => {
    const counts = await saveAllSessionAnalyses(client, [
      { analysis, durationSeconds: 300, sessionId: 'done', userId: 'user' },
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
    ]);
  });

  it('counts a failure against sessions the cron does not own', async () => {
    queueRows = [
      { attempts: 1, session_id: 'failed-before', status: 'failed' },
      { attempts: 2, session_id: 'last-try', status: 'failed' },
      { attempts: 1, session_id: 'queued', status: 'pending' },
      { attempts: 1, session_id: 'in-batch', status: 'submitted' },
    ];

    const counts = await saveAllSessionAnalyses(client, [
      failure('new'),
      failure('failed-before'),
      failure('last-try'),
      failure('queued'),
      failure('in-batch'),
    ]);

    expect(counts).toEqual({ errorCount: 0, skippedCount: 5, successCount: 0 });
    expect(writes).toHaveLength(1);
    expect(writes[0].table).toBe('call_analysis_queue');
    expect(writes[0].options).toEqual({ onConflict: 'session_id' });
    expect(writes[0].rows).toEqual([
      expect.objectContaining({
        attempts: 1,
        last_error: 'parse failed',
        session_id: 'new',
        status: 'failed',
      }),
      expect.objectContaining({ attempts: 2, session_id: 'failed-before' }),
      expect.objectContaining({ attempts: 3, session_id: 'last-try' }),
    ]);
  });
});
