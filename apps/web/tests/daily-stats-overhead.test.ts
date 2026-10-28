import { afterEach, describe, expect, test, vi } from 'vitest';

import costs from '../app/api/daily-stats/overhead-costs.json';

const baselinePath = '../app/api/daily-stats/overhead-costs.json';

afterEach(() => {
  vi.doUnmock(baselinePath);
  vi.resetModules();
});

describe('LiveKit subscription allocation', () => {
  test.each([
    ['2026-10-01', '2026-11-01', 0],
    ['2026-11-01', '2026-11-02', 1],
    ['2026-10-15', '2026-11-14', 13],
    ['2026-11-01', '2026-12-01', 30],
    ['2026-12-31', '2027-01-02', 2],
    ['2026-11-01', '2026-11-01', 0],
  ])('allocates only active days in %s to %s', async (from, to, days) => {
    const { summarizeOverhead } = await import(
      '../app/api/daily-stats/overhead'
    );
    const result = summarizeOverhead(new Date(from), new Date(to));
    expect(result.liveKit).toBeCloseTo(50 * (12 / 365) * days);
    expect(result.total).toBeCloseTo(
      result.vercel + result.callServer + result.cloudflare + result.liveKit,
    );
  });
});

describe('overhead baseline validation', () => {
  test.each([
    { amounts: [] },
    { amounts: [-1] },
    { amounts: [Number.NaN] },
    { amounts: [Number.POSITIVE_INFINITY] },
  ])(
    'rejects invalid monthly amounts $amounts before reporting',
    async ({ amounts }) => {
      const baseline = structuredClone(costs);
      baseline.monthlyInvoicesUsd.vercel = amounts;
      vi.doMock(baselinePath, () => ({ default: baseline }));
      await expect(import('../app/api/daily-stats/overhead')).rejects.toThrow(
        'Invalid overhead baseline for vercel',
      );
    },
  );

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid annual reservation %s before reporting',
    async (amount) => {
      vi.doMock(baselinePath, () => ({
        default: { ...costs, flyAnnualReservationUsd: amount },
      }));
      await expect(import('../app/api/daily-stats/overhead')).rejects.toThrow(
        'Invalid overhead baseline for Fly.io annual reservation',
      );
    },
  );

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid LiveKit amount %s before reporting',
    async (amount) => {
      vi.doMock(baselinePath, () => ({
        default: { ...costs, liveKitMonthlyUsd: amount },
      }));
      await expect(import('../app/api/daily-stats/overhead')).rejects.toThrow(
        'Invalid overhead baseline for LiveKit subscription',
      );
    },
  );

  test('rejects an invalid LiveKit start date', async () => {
    vi.doMock(baselinePath, () => ({
      default: { ...costs, liveKitStartsAt: 'invalid' },
    }));
    await expect(import('../app/api/daily-stats/overhead')).rejects.toThrow(
      'Invalid LiveKit subscription start date',
    );
  });

  test('accepts confirmed zero costs', async () => {
    vi.doMock(baselinePath, () => ({
      default: {
        ...costs,
        flyAnnualReservationUsd: 0,
        liveKitMonthlyUsd: 0,
        monthlyInvoicesUsd: {
          cloudflare: [0],
          flyCallServer: [0],
          vercel: [0],
        },
      },
    }));
    const { summarizeOverhead } = await import(
      '../app/api/daily-stats/overhead'
    );
    expect(
      summarizeOverhead(new Date('2026-11-01'), new Date('2026-11-02')).total,
    ).toBe(0);
  });
});
