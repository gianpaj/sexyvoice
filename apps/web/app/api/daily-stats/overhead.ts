import costs from './overhead-costs.json';

function validateAmounts(provider: string, amounts: number[]) {
  if (
    amounts.length === 0 ||
    amounts.some((amount) => !Number.isFinite(amount) || amount < 0)
  ) {
    throw new Error(`Invalid overhead baseline for ${provider}`);
  }
}

for (const [provider, amounts] of Object.entries(costs.monthlyInvoicesUsd)) {
  validateAmounts(provider, amounts);
}
validateAmounts('Fly.io annual reservation', [costs.flyAnnualReservationUsd]);
validateAmounts('LiveKit subscription', [costs.liveKitMonthlyUsd]);

const liveKitStartsAt = Date.parse(costs.liveKitStartsAt);
if (!Number.isFinite(liveKitStartsAt)) {
  throw new Error('Invalid LiveKit subscription start date');
}

const average = (amounts: number[]) =>
  amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;

export function summarizeOverhead(start: Date, end: Date) {
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  const monthly = costs.monthlyInvoicesUsd;
  const monthlyToPeriod = (12 / 365) * days;
  const callServer =
    (average(monthly.flyCallServer) + costs.flyAnnualReservationUsd / 12) *
    monthlyToPeriod;
  const vercel = average(monthly.vercel) * monthlyToPeriod;
  const cloudflare = average(monthly.cloudflare) * monthlyToPeriod;
  const liveKitDays = Math.max(
    0,
    (end.getTime() - Math.max(start.getTime(), liveKitStartsAt)) / 86_400_000,
  );
  const liveKit = costs.liveKitMonthlyUsd * (12 / 365) * liveKitDays;

  return {
    callServer,
    cloudflare,
    liveKit,
    total: vercel + callServer + cloudflare + liveKit,
    vercel,
  };
}
