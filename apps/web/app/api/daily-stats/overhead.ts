import costs from './overhead-costs.json';

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

  return {
    callServer,
    cloudflare,
    total: vercel + callServer + cloudflare,
    vercel,
  };
}
