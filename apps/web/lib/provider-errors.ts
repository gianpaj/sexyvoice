const PROVIDER_STATUS_PROPERTIES = [
  'status',
  'statusCode',
  'raw_status_code',
] as const;

export function getProviderErrorMessage(error: unknown): string {
  return Error.isError(error) ? error.message : String(error);
}

export function getProviderErrorName(error: unknown): string {
  return Error.isError(error) ? error.name : typeof error;
}

export function getProviderStatusCode(error: unknown): number | null {
  if (!(error && typeof error === 'object')) {
    return null;
  }

  for (const property of PROVIDER_STATUS_PROPERTIES) {
    if (property in error) {
      const value = (error as Record<string, unknown>)[property];
      if (typeof value === 'number') {
        return value;
      }
    }
  }

  return null;
}

export function isTransientProviderFailure(error: unknown): boolean {
  const statusCode = getProviderStatusCode(error);
  const message = getProviderErrorMessage(error).toLowerCase();

  return (
    (statusCode !== null && statusCode >= 500 && statusCode < 600) ||
    /status 5\d\d|bad gateway|internal server error|service unavailable|gateway timeout/.test(
      message,
    )
  );
}
