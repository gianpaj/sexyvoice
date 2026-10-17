export function isCreditBalance(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount);
}
