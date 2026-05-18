import type { GoogleApiError } from './googleErrors';

export type GoogleRpcStatus =
  | 'INVALID_ARGUMENT'
  | 'FAILED_PRECONDITION'
  | 'OUT_OF_RANGE'
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'ABORTED'
  | 'ALREADY_EXISTS'
  | 'RESOURCE_EXHAUSTED'
  | 'CANCELLED'
  | 'UNKNOWN'
  | 'INTERNAL'
  | 'DATA_LOSS'
  | 'UNIMPLEMENTED'
  | 'UNAVAILABLE'
  | 'DEADLINE_EXCEEDED'
  | (string & {});

export type GoogleApiErrorWithStatus = GoogleApiError & {
  status?: GoogleRpcStatus;
};

export function mapHttpToGoogleRpcStatus(
  httpStatus: number | undefined,
): GoogleRpcStatus {
  switch (httpStatus) {
    case 400:
      return 'INVALID_ARGUMENT';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'PERMISSION_DENIED';
    case 404:
      return 'NOT_FOUND';
    case 408:
      return 'DEADLINE_EXCEEDED';
    case 409:
      return 'ALREADY_EXISTS';
    case 429:
      return 'RESOURCE_EXHAUSTED';
    case 500:
      return 'INTERNAL';
    case 501:
      return 'UNIMPLEMENTED';
    case 502:
    case 503:
      return 'UNAVAILABLE';
    case 504:
      return 'DEADLINE_EXCEEDED';
    default:
      return 'UNKNOWN';
  }
}

export function getGoogleApiErrorStatus(
  error: GoogleApiErrorWithStatus,
): GoogleRpcStatus {
  return error.status ?? mapHttpToGoogleRpcStatus(error.code);
}
