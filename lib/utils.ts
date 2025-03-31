import { type ClassValue, clsx } from 'clsx';
import { customAlphabet } from 'nanoid';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7,
); // 7-character random string

export async function fetcher<JSON = any>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<JSON> {
  const res = await fetch(input, init);

  if (!res.ok) {
    const json = await res.json();
    if (json.error) {
      const error = new Error(json.error) as Error & {
        status: number;
      };
      error.status = res.status;
      throw error;
    }
    throw new Error('An unexpected error occurred');
  }

  return res.json();
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function estimateCredits(text: string): number {
  // Remove extra whitespace and split into words
  const words = text.trim().split(/\s+/).length;

  if (!text.trim()) {
    return 0;
  }

  // Using average speaking rate of 135 words per minute (middle of 120-150 range)
  const wordsPerSecond = 135 / 60; // 2.25 words per second

  // Calculate estimated seconds (credits) by 2.5
  return Math.ceil((words / wordsPerSecond) * 2.5);
}
