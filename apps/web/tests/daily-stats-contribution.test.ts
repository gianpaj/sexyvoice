import { describe, expect, test, vi } from 'vitest';

import {
  type ContributionData,
  type CreditTransaction,
  formatContribution,
  summarizeContribution,
  type UsageEvent,
} from '../app/api/daily-stats/contribution';
// biome-ignore lint/performance/noNamespaceImport: spy on pricing inputs without changing production rates
import * as pricing from '../lib/api/pricing';
import {
  type CallSessionCostInput,
  resolveUsageCost,
} from '../lib/usage-costs';

const start = new Date('2026-09-05T00:00:00Z');
const end = new Date('2026-09-06T00:00:00Z');
function event(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    credits_used: 100,
    dollar_amount: 15,
    duration_seconds: null,
    id: 'event',
    input_chars: null,
    metadata: {},
    model: null,
    occurred_at: '2026-09-05T12:00:00Z',
    source_id: null,
    source_type: 'tts',
    user_id: 'free',
    ...overrides,
  };
}
function data(events: UsageEvent[] = []): ContributionData {
  return { audioUsage: {}, calls: [], events, linkedCallIds: [] };
}
function purchase(
  overrides: Partial<CreditTransaction> = {},
): CreditTransaction {
  return {
    created_at: '2026-09-05T00:00:00Z',
    description: 'Purchase',
    metadata: { dollarAmount: 100 },
    type: 'purchase',
    user_id: 'paid',
    ...overrides,
  };
}
describe('cash contribution', () => {
  test('subtracts paid and free costs from cash after refunds', () => {
    const result = summarizeContribution(
      data([
        event(),
        event({ dollar_amount: 20, id: 'paid-event', user_id: 'paid' }),
      ]),
      [
        purchase(),
        purchase({ metadata: { dollarAmount: -5 }, type: 'refund' }),
      ],
      start,
      end,
    );
    expect(result.contribution).toBe(60);
    expect(result.contributionAlert).toBe(false);
    expect(result.coverage).toBe(5);
    expect(formatContribution('Yesterday', result).join('\n')).toContain(
      '5.00x',
    );
  });
  test('keeps each period to two lines and hides diagnostic detail', () => {
    const result = summarizeContribution(
      data([event()]),
      [purchase()],
      start,
      end,
    );
    const lines = formatContribution('Yesterday', result);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      '- Yesterday: $100.00 net − $15.00 usage = $85.00 left',
    );
    expect(lines.join('\n')).not.toMatch(/Cost records|Session-only|Free tts/);
  });
  test.each([0, 1, 5, 6, 100])(
    'alerts only when more than 5%% of records are unpriced: %s',
    (unknownCount) => {
      const events = Array.from({ length: 100 }, (_, index) =>
        event({
          dollar_amount: index < unknownCount ? null : 1,
          id: `${index}`,
        }),
      );
      const result = summarizeContribution(data(events), [], start, end);
      expect(result.incomplete).toBe(unknownCount > 0);
      expect(result.coverageAlert).toBe(unknownCount > 5);
      expect(result.contributionAlert).toBe(unknownCount <= 5);
      if (unknownCount > 0) expect(result.coverage).toBeNull();
    },
  );
  test('unclassified usage alerts regardless of the unpriced share', () => {
    const malformedEvent = {
      ...event(),
      user_id: null,
    } as unknown as UsageEvent;
    expect(
      summarizeContribution(data([malformedEvent]), [], start, end)
        .coverageAlert,
    ).toBe(true);
  });
  test('classifies at purchase time and recognizes old purchasers', () => {
    const result = summarizeContribution(
      data([
        event({ user_id: 'paid' }),
        event({
          id: 'after',
          occurred_at: '2026-09-05T14:00:00Z',
          user_id: 'paid',
        }),
        event({ id: 'old', user_id: 'old' }),
      ]),
      [
        purchase({ created_at: '2026-09-05T14:00:00Z' }),
        purchase({ created_at: '2025-01-01T00:00:00Z', user_id: 'old' }),
      ],
      start,
      end,
    );
    expect(result.totals).toEqual({ free: 15, paid: 30, unclassified: 0 });
    expect(result.netCollections).toBe(100);
  });
  test('manual grants, credit refunds, and dispute holds do not affect cash', () => {
    const result = summarizeContribution(
      data(),
      [
        purchase(),
        purchase({ description: 'Manual grant' }),
        purchase({ type: 'freemium' }),
        purchase({ metadata: { reason: 'bug refund' }, type: 'refund' }),
        purchase({
          metadata: { dollarAmount: -100, reason: 'chargeback_dispute' },
          type: 'refund',
        }),
        purchase({
          metadata: {
            dollarAmount: 100,
            reason: 'chargeback_dispute_released',
          },
          type: 'refund',
        }),
      ],
      start,
      end,
    );
    expect(result.netCollections).toBe(100);
    expect(result.contributionAlert).toBe(false);
    expect(result.coverage).toBeNull();
  });
  test('missing costs and identities make coverage incomplete', () => {
    // Exercise malformed input despite the database's NOT NULL constraint.
    const malformedEvent = {
      ...event(),
      user_id: null,
    } as unknown as UsageEvent;
    const result = summarizeContribution(
      data([event({ dollar_amount: -1 }), malformedEvent]),
      [],
      start,
      end,
    );
    expect(result.bases.unknown).toBe(1);
    expect(result.totals.unclassified).toBe(15);
    expect(result.incomplete).toBe(true);
    expect(result.coverage).toBeNull();
    expect(formatContribution('Yesterday', result)[0]).toContain(
      '(1 unpriced, 1 unclassified)',
    );
    expect(formatContribution('Yesterday', result).join('\n')).toContain(
      'coverage incomplete',
    );
  });
  test('includes API/enhancement costs and preserves negative contribution', () => {
    const result = summarizeContribution(
      data([
        event({ source_type: 'api_tts' }),
        event({ id: 'enhancement', source_type: 'audio_processing' }),
      ]),
      [],
      start,
      end,
    );
    expect(result.contribution).toBe(-30);
    expect(result.coverage).toBe(0);
    expect(formatContribution('Yesterday', result)[0]).toContain(
      '= -$30.00 left',
    );
  });
});
describe('call supplementation', () => {
  const call = {
    duration_seconds: 5,
    ended_at: '2026-09-05T12:00:05Z',
    id: 'call',
    model: 'grok-voice-think-fast-1.0',
    started_at: '2026-09-05T12:00:00Z',
    status: 'completed',
    user_id: 'free',
  };
  test('estimates a short call without inventing consumed credits', () => {
    const result = summarizeContribution(
      { ...data(), calls: [call] },
      [],
      start,
      end,
    );
    expect(result.callCost).toBeCloseTo((5 / 60) * 0.05);
  });
  test('prices a zero-duration session from its sub-second timestamps', () => {
    const result = summarizeContribution(
      {
        ...data(),
        calls: [
          {
            ...call,
            duration_seconds: 0,
            ended_at: '2026-09-05T12:00:00.769Z',
          },
        ],
      },
      [],
      start,
      end,
    );
    expect(result.callCost).toBeCloseTo((0.769 / 60) * 0.05, 10);
    expect(result.bases.estimated).toBe(1);
    expect(result.bases.unknown).toBe(0);
    expect(result.incomplete).toBe(false);
  });
  test.each([
    undefined,
    null,
    'invalid',
    '2026-09-05T11:59:59Z',
    '2026-09-05T12:00:00Z',
    '2026-09-05T12:00:01Z',
    '2026-09-05T12:00:05Z',
  ])(
    'does not infer sub-second cost from invalid or inconsistent end time %s',
    (ended_at) => {
      const result = resolveUsageCost(
        event({ dollar_amount: null, source_type: 'live_call' }),
        { ...call, duration_seconds: 0, ended_at },
      );
      expect(result.basis).toBe('unknown');
    },
  );
  test('does not replace positive or missing durations with timestamp estimates', () => {
    const usage = event({ dollar_amount: null, source_type: 'live_call' });
    const timestamps = { ...call, ended_at: '2026-09-05T12:00:00.500Z' };
    expect(resolveUsageCost(usage, timestamps).amount).toBeCloseTo(
      (5 / 60) * 0.05,
      10,
    );
    // The database disallows null; retain coverage for malformed input.
    const malformedCall = {
      ...timestamps,
      duration_seconds: null,
    } as unknown as CallSessionCostInput;
    expect(resolveUsageCost(usage, malformedCall).basis).toBe('unknown');
    expect(
      resolveUsageCost(
        { ...usage, dollar_amount: 0.1 },
        { ...timestamps, duration_seconds: 0 },
      ),
    ).toEqual({ amount: 0.1, basis: 'recorded' });
  });
  test('ordinary free and paid calls come from events, counted once', () => {
    const result = summarizeContribution(
      {
        ...data([
          event({ source_id: 'call', source_type: 'live_call' }),
          event({
            id: 'paid-call',
            source_id: 'other',
            source_type: 'live_call',
            user_id: 'paid',
          }),
        ]),
        calls: [call],
      },
      [purchase()],
      start,
      end,
    );
    expect(result.callCost).toBe(30);
    expect(result.totals.free).toBe(15);
    expect(result.totals.paid).toBe(15);
  });
  test('a linked event outside the window prevents a duplicate session estimate', () => {
    expect(
      summarizeContribution(
        { ...data(), calls: [call], linkedCallIds: ['call'] },
        [],
        start,
        end,
      ).callCost,
    ).toBe(0);
  });
  test('attributes cross-midnight call cost exactly once by event date', () => {
    const linkedEvent = event({
      dollar_amount: 0.2,
      occurred_at: end.toISOString(),
      source_id: call.id,
      source_type: 'live_call',
    });
    const before = summarizeContribution(
      { ...data(), calls: [call], linkedCallIds: [call.id] },
      [],
      start,
      end,
    );
    const after = summarizeContribution(
      { ...data([linkedEvent]), calls: [call] },
      [],
      end,
      new Date('2026-09-07T00:00:00Z'),
    );
    expect(before.callCost).toBe(0);
    expect(after.callCost).toBe(0.2);
    expect(before.callCost + after.callCost).toBe(0.2);
  });
  test('estimates missing-event costs from the stored duration', () => {
    expect(
      summarizeContribution(
        { ...data(), calls: [{ ...call, duration_seconds: 10 }] },
        [],
        start,
        end,
      ).callCost,
    ).toBeCloseTo((10 / 60) * 0.05, 10);
  });
  test('ongoing sessions do not add finalized cost', () => {
    const result = summarizeContribution(
      { ...data(), calls: [{ ...call, ended_at: null, status: 'active' }] },
      [],
      start,
      end,
    );
    expect(result.callCost).toBe(0);
  });
  test('UTC windows exclude their end and include legacy terminal sessions', () => {
    const result = summarizeContribution(
      {
        ...data([event({ occurred_at: end.toISOString() })]),
        calls: [{ ...call, ended_at: null }],
      },
      [],
      start,
      end,
    );
    expect(result.bases.recorded).toBe(0);
  });
});
describe('cost provenance', () => {
  test.each([null, 0, -1, Number.NaN])(
    'unsupported cost %s stays unknown',
    (dollar_amount) => {
      expect(resolveUsageCost(event({ dollar_amount })).basis).toBe('unknown');
    },
  );
  test('streaming Gemini uses linked token counts at the actual model rate', () => {
    const result = resolveUsageCost(
      event({
        dollar_amount: null,
        metadata: { model: 'gemini-2.5-pro-preview-tts' },
        model: null,
      }),
      undefined,
      { candidatesTokenCount: '1000', promptTokenCount: '100' },
    );
    expect(result.basis).toBe('estimated');
    expect(result.amount).toBeCloseTo(0.0201);
  });
  test('Flash fallback uses Flash pricing and missing tokens stay unknown', () => {
    const usage = event({
      dollar_amount: null,
      model: 'gemini-2.5-flash-preview-tts',
    });
    expect(
      resolveUsageCost(usage, undefined, {
        candidatesTokenCount: 1000,
        promptTokenCount: 100,
      }).amount,
    ).toBeCloseTo(0.010_05);
    expect(resolveUsageCost(usage).basis).toBe('unknown');
  });
  test.each(['tts', 'api_tts'] as const)(
    'preserves the %s source when estimating Gemini cost',
    (source_type) => {
      const spy = vi.spyOn(pricing, 'calculateGenerateApiDollarAmount');
      try {
        resolveUsageCost(
          event({
            dollar_amount: null,
            model: 'gemini-2.5-pro-preview-tts',
            source_type,
          }),
          undefined,
          { candidatesTokenCount: 1000, promptTokenCount: 100 },
        );
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({ sourceType: source_type }),
        );
      } finally {
        spy.mockRestore();
      }
    },
  );
  test('linked provider token counts override conflicting event metadata', () => {
    const result = resolveUsageCost(
      event({
        dollar_amount: null,
        metadata: { candidatesTokenCount: 9000, promptTokenCount: 900 },
        model: 'gemini-2.5-pro-preview-tts',
      }),
      undefined,
      { candidatesTokenCount: 1000, promptTokenCount: 100 },
    );
    expect(result.amount).toBeCloseTo(0.0201);
  });
  test('invalid linked token counts fall back to valid event metadata', () => {
    const result = resolveUsageCost(
      event({
        dollar_amount: null,
        metadata: { candidatesTokenCount: 1000, promptTokenCount: 100 },
        model: 'gemini-2.5-pro-preview-tts',
      }),
      undefined,
      { candidatesTokenCount: null, promptTokenCount: 'invalid' },
    );
    expect(result.amount).toBeCloseTo(0.0201);
  });
  test('unknown call models do not inherit a legacy price', () => {
    expect(
      resolveUsageCost(
        event({
          dollar_amount: null,
          duration_seconds: 60,
          model: 'unknown',
          source_type: 'live_call',
        }),
      ).basis,
    ).toBe('unknown');
  });
});
