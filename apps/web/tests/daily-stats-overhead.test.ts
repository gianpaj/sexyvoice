import { afterEach, describe, expect, test, vi } from 'vitest';

import costs from '../app/api/daily-stats/overhead-costs.json';

const baselinePath = '../app/api/daily-stats/overhead-costs.json';
const start = new Date('2026-10-14T00:00:00Z');
const end = new Date('2026-10-15T00:00:00Z');

afterEach(() => {
  vi.doUnmock(baselinePath);
  vi.resetModules();
});

describe('overhead basis label', () => {
  test.each([
    {
      months: ['2026-08', '2026-09', '2026-10'],
      label: 'Aug 2026, Sep 2026, Oct 2026',
    },
    { months: ['2026-12', '2027-01'], label: 'Dec 2026, Jan 2027' },
    { months: ['2026-07', '2026-09'], label: 'Jul 2026, Sep 2026' },
  ])('uses saved invoice months $months', async ({ months, label }) => {
    vi.doMock(baselinePath, () => ({
      default: { ...costs, invoiceMonths: months },
    }));
    const { formatOverheadBasis } = await import(
      '../app/api/daily-stats/overhead'
    );
    expect(formatOverheadBasis()).toBe(
      `Overhead uses ${label} invoice averages plus an annual reservation.`,
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

  test('accepts confirmed zero costs', async () => {
    vi.doMock(baselinePath, () => ({
      default: {
        ...costs,
        flyAnnualReservationUsd: 0,
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
    expect(summarizeOverhead(start, end).total).toBe(0);
  });
});
