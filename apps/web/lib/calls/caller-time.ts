/** The caller's clock, captured for each token request, reconnects included. */
export function getCallerTime(): { clientTime: string; timeZone?: string } {
  const clientTime = new Date().toISOString();
  try {
    return {
      clientTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  } catch {
    return { clientTime };
  }
}
