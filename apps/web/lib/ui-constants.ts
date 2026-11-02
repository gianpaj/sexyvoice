export const TOAST_DURATION = 6000;

/**
 * Extra characters accepted above a text field's character limit before input
 * is cut off. Every limited textarea on the generate and clone pages uses this
 * one value, so the experience does not change with the selected TTS model or
 * the clone language.
 *
 * The grace window exists so going over the limit is visible and fixable: the
 * character counter turns red at the limit while the text stays editable,
 * instead of the field silently refusing keystrokes at the exact boundary.
 * Generation is still blocked at the real limit, which the API also enforces.
 */
export const CHARACTERS_LIMIT_GRACE = 30;
