export const CALL_FEEDBACK_REASONS = [
  'misheard',
  'interrupted',
  'audio',
  'awkward',
  'dropped',
  'other',
] as const;

export const FEEDBACK_NOTE_MAX_LENGTH = 1000;

export type FeedbackRating = 'up' | 'down';
export type FeedbackTarget =
  | { kind: 'call'; roomName: string }
  | { kind: 'audio'; audioFileId: string };

export interface FeedbackSubmission {
  note?: string;
  rating: FeedbackRating;
  reasonCode?: (typeof CALL_FEEDBACK_REASONS)[number];
  target: FeedbackTarget;
}
