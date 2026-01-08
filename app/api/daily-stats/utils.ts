export function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function subtractDays(date: Date, days: number): Date {
  // 86_400_000 milliseconds in 24 hours
  return new Date(date.getTime() - days * 86_400_000);
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function startOfPreviousMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}
export function formatChange(today: number, yesterday: number): string {
  const diff = today - yesterday;
  const formatted = diff % 1 === 0 ? diff.toString() : diff.toFixed(1);
  return diff >= 0 ? `+${formatted}` : `${formatted}`;
}

export function formatCurrencyChange(
  current: number,
  previous: number,
): string {
  const diff = current - previous;
  return diff >= 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`;
}

export function reduceAmountUsd(acc: number, row: { metadata: Json }): number {
  if (!row.metadata || typeof row.metadata !== 'object') {
    console.log('Invalid metadata in row:', row);
    return acc;
  }
  const { dollarAmount } = row.metadata as {
    dollarAmount: number;
  };
  if (typeof dollarAmount === 'number') {
    return acc + dollarAmount;
  }
  return acc;
}

export function maskUsername(username?: string): string | undefined {
  let maskedUsername = username;
  if (username?.includes('@')) {
    const [localPart, domain] = username.split('@');
    if (localPart.length > 6) {
      const first3 = localPart.slice(0, 3);
      const last3 = localPart.slice(-3);
      maskedUsername = `${first3}...${last3}@${domain}`;
    } else if (localPart.length > 3) {
      const first3 = localPart.slice(0, 3);
      maskedUsername = `${first3}...@${domain}`;
    } else {
      maskedUsername = `${localPart.slice(0, 1)}...@${domain}`;
    }
  }
  return maskedUsername;
}

export const filterByDateRange = <T extends { created_at: string }>(
  items: T[],
  start: Date,
  end: Date,
) => {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return items.filter((item) => {
    const itemTime = new Date(item.created_at).getTime();
    return itemTime >= startTime && itemTime < endTime;
  });
};
