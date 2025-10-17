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

export function estimateCredits(
  text: string,
  voice: string,
  model?: string,
): number {
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

  let multiplier: number;
  // Calculate multiplier based on voice
  switch (voice) {
    case 'pietro':
    case 'giulia':
    case 'carlo':
    case 'javi':
    case 'sergio':
    case 'maria':
      multiplier = 8;
      break;
    case 'clone':
      multiplier = 11;
      break;
    default:
      multiplier = 4;
      break;
  }

  if (model === 'gpro') {
    multiplier = 4;
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

/**
 * Validates and adjusts credit amount to meet minimum and increment requirements
 * @param {number} amount - The credit amount to validate
 * @returns {number} The adjusted credit amount
 */
export function validateCreditAmount(amount: number): number {
  const MIN_CREDITS = 5000;
  const INCREMENT = 500;

  if (amount < MIN_CREDITS) {
    return MIN_CREDITS;
  }

  // Round to nearest increment
  return Math.round(amount / INCREMENT) * INCREMENT;
}

/**
 * Calculates the price for a given amount of credits
 * Rate: $5 per 10,000 credits (0.0005 per credit)
 * @param {number} credits - Number of credits
 * @returns {number} Price in cents
 */
export function calculateCreditPrice(credits: number): number {
  const RATE_PER_CREDIT = 0.0005; // $0.0005 per credit
  return Math.round(credits * RATE_PER_CREDIT * 100); // Convert to cents
}

/**
 * Formats credits with thousand separators
 * @param {number} credits - Number of credits
 * @returns {string} Formatted credit string
 */
export function formatCredits(credits: number): string {
  return credits.toLocaleString();
}

/**
 * Formats price in dollars
 * @param {number} cents - Price in cents
 * @returns {string} Formatted price string
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
