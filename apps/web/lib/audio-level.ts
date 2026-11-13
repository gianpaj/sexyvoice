/**
 * A Web Audio frequency value in dB as a 0–1 bar level: -100 dB and below is
 * 0, -10 dB and above is 1, square-rooted so quiet sounds still register.
 */
export function levelFromDb(db: number): number {
  const clamped = Math.max(-100, Math.min(-10, db));
  return Math.sqrt((clamped + 100) / 90);
}
