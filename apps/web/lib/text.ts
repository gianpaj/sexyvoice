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
