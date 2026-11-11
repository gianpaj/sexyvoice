/** Capture clock context when requesting a call, including reconnects. */
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
