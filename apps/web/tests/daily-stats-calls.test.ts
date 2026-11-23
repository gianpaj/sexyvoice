import { describe, expect, it } from 'vitest';

import { formatCallsSection } from '@/app/api/daily-stats/calls';
import { formatMinutes, formatTrend } from '@/app/api/daily-stats/utils';
import { ModelId } from '@/data/models';

const TODAY = new Date('2026-09-12T00:00:00Z');
const GROK = ModelId.GROK_VOICE_THINK_FAST_2_0;

function call(
  startedAt: string,
  duration_seconds: number,
  {
    character_id = 'public-1',
    free_call = true,
    model = GROK,
  }: { character_id?: string | null; free_call?: boolean; model?: string } = {},
) {
  return {
    character_id,
    duration_seconds,
    free_call,
    model,
    started_at: startedAt,
    status: 'completed',
  };
}

describe('formatTrend', () => {
  it.each([
    [0, 0, ''],
    [5, 0, 'new'],
    [124, 100, ''],
    // Rounds to 25% but stays below the threshold.
    [124.6, 100, ''],
    [125, 100, '↑25%'],
    [161.4, 100, '↑61%'],
    [76, 100, ''],
    [75, 100, '↓25%'],
    [0, 4, '↓100%'],
  ])('%s vs %s → %s', (current, baseline, expected) => {
    expect(formatTrend(current, baseline)).toBe(expected);
  });
});

it('takes a lower threshold for average call length', () => {
  expect(formatTrend(109, 100, 10)).toBe('');
  expect(formatTrend(110, 100, 10)).toBe('↑10%');
});

describe('formatMinutes', () => {
  it.each([
    [0, '0m'],
    [2814, '47m'],
    [3570, '1h 0m'],
    [29_400, '8h 10m'],
  ])('%ss → %s', (seconds, expected) => {
    expect(formatMinutes(seconds)).toBe(expected);
  });
});

describe('formatCallsSection', () => {
  it('compares yesterday with the prior 14 days and splits by user and character', () => {
    // One free 2-minute public-character call on each of the 14 prior days.
    const priorCalls = Array.from({ length: 14 }, (_, index) =>
      call(new Date(Date.UTC(2026, 7, 28 + index, 9)).toISOString(), 120),
    );
    const yesterdayCalls = [
      call('2026-09-11T00:00:00Z', 180),
      call('2026-09-11T10:00:00Z', 120),
      call('2026-09-11T11:00:00Z', 300, {
        character_id: 'mine',
        free_call: false,
      }),
      // Unsaved custom prompt on a saved Inworld voice.
      call('2026-09-11T23:59:59.999Z', 60, {
        character_id: null,
        free_call: false,
        model: ModelId.INWORLD_TTS,
      }),
    ];

    const lines = formatCallsSection({
      aiCost: { baseline: 14 * 0.12, yesterday: 0.66 },
      baselineDays: 14,
      allTime: { avgSeconds: 159, count: 6957 },
      calls: [...priorCalls, ...yesterdayCalls],
      inworldVoices: '25 / 3,000',
      newCharactersYesterday: 2,
      publicCharacterIds: new Set(['public-1']),
      today: TODAY,
    });

    expect(lines).toEqual([
      '📞 Calls: 4 · 11m ↑450% · avg 2m 45s',
      '  - 14d daily avg: 1.0 · 2m · avg 2m 0s',
      '  - 7d vs prior 7d: 10 · 23m ↑64% · avg 2m 18s ↑15%',
      '  - Completed (>10s): 4',
      '  - Free users: 2 · 5m ↑150% · avg 2m 30s ↑25%',
      '  - Paying users: 2 · 6m new · avg 3m 0s new',
      '  - Public characters: 2 · 5m ↑150% · avg 2m 30s',
      '  - Custom, Grok voice: 1 · 5m new · avg 5m 0s',
      '  - Custom, cloned voice: 1 · 1m new · avg 1m 0s',
      '  - New custom characters: 2',
      '  - AI usage (est.): $0.66 · $0.060/min · 14d avg $0.12/day',
      '  - All-time: 6,957 calls (avg 2m 39s) · Inworld voices: 25 / 3,000',
    ]);
  });

  it('marks a flat average call length on the user lines only', () => {
    const lines = formatCallsSection({
      aiCost: { baseline: 0, yesterday: 0 },
      baselineDays: 14,
      allTime: { avgSeconds: 0, count: 0 },
      calls: [
        call('2026-09-10T12:00:00Z', 1300),
        call('2026-09-11T12:00:00Z', 1350),
      ],
      inworldVoices: 'unavailable',
      newCharactersYesterday: 0,
      publicCharacterIds: new Set(['public-1']),
      today: TODAY,
    });

    expect(lines).toContain('  - Free users: 1 · 23m ↑1354% · avg 22m 30s →');
    expect(lines).toContain(
      '  - Public characters: 1 · 23m ↑1354% · avg 22m 30s',
    );
  });

  it('omits average length and cost per minute when yesterday had no calls', () => {
    const lines = formatCallsSection({
      aiCost: { baseline: 1.4, yesterday: 0 },
      baselineDays: 14,
      allTime: { avgSeconds: 0, count: 0 },
      calls: [call('2026-09-05T12:00:00Z', 600)],
      inworldVoices: 'unavailable',
      newCharactersYesterday: 0,
      publicCharacterIds: new Set(['public-1']),
      today: TODAY,
    });

    expect(lines[0]).toBe('📞 Calls: 0 · 0m ↓100%');
    expect(lines).toContain('  - Paying users: 0 · 0m');
    expect(lines).toContain('  - AI usage (est.): $0.00 · 14d avg $0.10/day');
  });
});
