import { type ClassValue, clsx } from 'clsx';
import { customAlphabet } from 'nanoid';
import { redirect } from 'next/navigation';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7,
); // 7-character random string

export function formatDate(
  input: string | number | Date,
  { withTime = false }: { withTime?: boolean } = {},
): string {
  const date = new Date(input);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...(withTime && {
      hour: '2-digit',
      minute: '2-digit',
    }),
  });
}

export function estimateCredits(text: string, voice: string): number {
  // Remove extra whitespace and split into words
  const words = text.trim().split(/\s+/).length;

  if (!text.trim()) {
    return 0;
  }

  if (!voice) {
    throw new Error('Voice is required');
  }

  // Using average speaking rate of 100 words per minute (middle of 120-150 range)
  const wordsPerSecond = 100 / 60; // 2.25 words per second

  let multiplier = 4;
  // Calculate multiplier based on voice
  if (
    ['pietro', 'giulia', 'carlo', 'javi', 'sergio', 'maria'].includes(voice)
  ) {
    multiplier = 8;
  }

  // Calculate estimated seconds (credits) by 10
  return Math.ceil((words / wordsPerSecond) * 10 * multiplier);
}

export function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 * @param {('error' | 'success')} type - The type of message, either 'error' or 'success'.
 * @param {string} path - The path to redirect to.
 * @param {string} message - The message to be encoded and added as a query parameter.
 * @returns {never} This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: 'error' | 'success',
  path: string,
  message: string,
): never {
  return redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}
