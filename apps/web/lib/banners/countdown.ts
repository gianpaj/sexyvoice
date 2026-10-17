export function isBannerCountdownExpired(
  endDate: string | undefined,
  now = Date.now(),
): boolean {
  return endDate ? Date.parse(endDate) <= now : false;
}
