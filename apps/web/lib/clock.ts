/**
 * A duration as a clock: `M:SS`, or `MM:SS` with `padMinutes`. From one hour
 * on, hours lead: `H:MM:SS`, or `HH:MM:SS` with `padMinutes`.
 */
export function formatClock(
  totalSeconds: number,
  { padMinutes = false }: { padMinutes?: boolean } = {},
): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  const lead = (value: number) => (padMinutes ? pad(value) : String(value));
  return hours > 0
    ? `${lead(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${lead(minutes)}:${pad(seconds)}`;
}
