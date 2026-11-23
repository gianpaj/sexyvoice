/**
 * Formats seconds as `m:ss.t`. Rounds to milliseconds before truncating to
 * tenths, so float sums such as 3.9 - 1.3 (2.5999…) show as 0:02.6.
 */
export function formatTime(valueSec: number): string {
  const totalTenths = Math.floor(Math.round(valueSec * 1000) / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor(totalTenths / 10) % 60;
  const tenths = totalTenths % 10;

  return `${minutes}:${`${seconds}`.padStart(2, '0')}.${tenths}`;
}
