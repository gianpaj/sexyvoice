export function countWords(text: string): number {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return 0;
  }

  return trimmedText.split(/\s+/).length;
}

export function calculateReadingTime(
  wordCount: number,
  wordsPerMinute = 200,
): number {
  if (wordCount <= 0) {
    return 0;
  }

  if (!(wordsPerMinute > 0)) {
    throw new RangeError('wordsPerMinute must be greater than 0');
  }

  return Math.ceil(wordCount / wordsPerMinute);
}

/**
 * Splits a marketing headline at its first comma. Pages render the second
 * part on its own line in the brand gradient.
 */
export function splitHeroTitle(title: string): [string, string] {
  const commaIndex = title.indexOf(',');
  return commaIndex === -1
    ? [title, '']
    : [title.slice(0, commaIndex), title.slice(commaIndex + 1)];
}
