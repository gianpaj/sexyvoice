/**
 * Shared request/response contract for the voice-cloning API
 * (`POST /api/clone-voice`), used by both the route handler and its client so
 * the two sides cannot drift apart.
 */

export type RouteErrorDetails = Record<
  string,
  boolean | number | string | null
>;

export type CloneRouteErrorCode =
  | 'errors.audioConversionFailed'
  | 'errors.audioConversionRequiredWebm'
  | 'errors.audioDurationInvalidFallback'
  | 'errors.audioDurationInvalidVoxtral'
  | 'errors.audioDurationUnknown'
  | 'errors.fileTooLarge'
  | 'errors.guardrailViolation'
  | 'errors.insufficientCredits'
  | 'errors.internalError'
  | 'errors.invalidContentType'
  | 'errors.invalidFileType'
  | 'errors.missingLocale'
  | 'errors.missingRequiredParameters'
  | 'errors.providerUnavailable'
  | 'errors.referenceAudioEnhancementInputTooLarge'
  | 'errors.referenceAudioEnhancementInputTooLong'
  | 'errors.textTooLong'
  | 'errors.unsupportedAudioFormat'
  | 'errors.unsupportedLocale'
  | 'errors.userNotFound';

/** Shape of the JSON body returned by every clone-voice error response. */
export interface CloneErrorResponseBody {
  error: string;
  serverMessage: string;
  status: number;
  code?: CloneRouteErrorCode;
  details?: RouteErrorDetails;
}

/** Shape of the JSON body returned by a successful clone-voice request. */
export interface CloneSuccessResponse {
  url: string;
  creditsUsed: number;
  creditsRemaining: number;
}

/** Names of the multipart form fields accepted by `POST /api/clone-voice`. */
export const CLONE_FORM_FIELDS = {
  file: 'file',
  text: 'text',
  locale: 'locale',
  enhanceReferenceAudio: 'enhanceReferenceAudio',
} as const;
