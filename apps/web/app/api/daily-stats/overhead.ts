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

const average = (amounts: number[]) =>
  amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;

export function formatOverheadBasis() {
  const formatter = new Intl.DateTimeFormat('en', {
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  });
  const months = costs.invoiceMonths
    .map((month) => formatter.format(new Date(`${month}-01T00:00:00Z`)))
    .join(', ');
  const reservation =
    costs.flyAnnualReservationUsd > 0 ? ' plus an annual reservation' : '';
  return `Overhead uses ${months} invoice averages${reservation}.`;
}

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
