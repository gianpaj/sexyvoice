/**
 * Client-side cookie utilities with fallback for older browsers.
 *
 * The Cookie Store API (cookieStore) is not supported in older browsers
 * (e.g., Safari < 16.4, Firefox < 128). These utilities provide a fallback
 * to document.cookie for broader browser compatibility.
 */

interface CookieOptions {
  name: string;
  value: string;
  expires?: number | Date;
  maxAge?: number;
  path?: string;
  sameSite?: 'strict' | 'lax' | 'none';
}

// Type definition for Cookie Store API
interface CookieStore {
  get(name: string): Promise<{ name: string; value: string } | null>;
  set(options: {
    name: string;
    value: string;
    expires?: number;
    path?: string;
    sameSite?: 'strict' | 'lax' | 'none';
  }): Promise<void>;
  delete(options: { name: string; path?: string }): Promise<void>;
}

type WindowWithCookieStore = Window & { cookieStore: CookieStore };

/**
 * Check if the Cookie Store API is available
 */
function hasCookieStore(): boolean {
  return typeof window !== 'undefined' && 'cookieStore' in window;
}

/**
 * Get the cookie store from window
 */
function getCookieStore(): CookieStore | null {
  if (hasCookieStore()) {
    return (window as WindowWithCookieStore).cookieStore;
  }
  return null;
}

/**
 * Build a cookie string for document.cookie
 */
function buildCookieString(options: CookieOptions): string {
  const {
    name,
    value,
    expires,
    maxAge,
    path = '/',
    sameSite = 'lax',
  } = options;

  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (expires) {
    const expiresDate = expires instanceof Date ? expires : new Date(expires);
    parts.push(`expires=${expiresDate.toUTCString()}`);
  }

  if (maxAge !== undefined) {
    parts.push(`max-age=${maxAge}`);
  }

  parts.push(`path=${path}`);
  parts.push(`samesite=${sameSite}`);

  return parts.join('; ');
}

/**
 * Set cookie using document.cookie (fallback)
 */
function setDocumentCookie(cookieString: string): void {
  if (typeof document !== 'undefined') {
    // biome-ignore lint/suspicious/noDocumentCookie: Fallback for browsers without Cookie Store API
    document.cookie = cookieString;
  }
}

/**
 * Parse cookies from document.cookie
 */
function parseDocumentCookies(): Map<string, string> {
  const cookieMap = new Map<string, string>();

  if (typeof document === 'undefined') {
    return cookieMap;
  }

  const cookies = document.cookie.split(';');

  for (const cookie of cookies) {
    const [rawName, ...valueParts] = cookie.trim().split('=');
    if (rawName) {
      const name = decodeURIComponent(rawName);
      const value = valueParts.join('=');
      cookieMap.set(name, value ? decodeURIComponent(value) : '');
    }
  }

  return cookieMap;
}

/**
 * Sets a cookie with fallback support for older browsers.
 */
export async function setCookie(options: CookieOptions): Promise<void> {
  const cookieStore = getCookieStore();

  if (cookieStore) {
    try {
      const expires =
        options.expires instanceof Date
          ? options.expires.getTime()
          : options.expires;

      await cookieStore.set({
        name: options.name,
        value: options.value,
        expires,
        path: options.path ?? '/',
        sameSite: options.sameSite ?? 'lax',
      });
      return;
    } catch {
      // Fall through to document.cookie fallback
    }
  }

  setDocumentCookie(buildCookieString(options));
}

/**
 * Gets a cookie value with fallback support for older browsers.
 * Returns null if the cookie is not found.
 */
export async function getCookie(name: string): Promise<string | null> {
  const cookieStore = getCookieStore();

  if (cookieStore) {
    try {
      const cookie = await cookieStore.get(name);
      return cookie?.value ?? null;
    } catch {
      // Fall through to document.cookie fallback
    }
  }

  const cookies = parseDocumentCookies();
  return cookies.get(name) ?? null;
}

/**
 * Deletes a cookie with fallback support for older browsers.
 */
export async function deleteCookie(name: string, path = '/'): Promise<void> {
  const cookieStore = getCookieStore();

  if (cookieStore) {
    try {
      await cookieStore.delete({ name, path });
      return;
    } catch {
      // Fall through to document.cookie fallback
    }
  }

  // Set cookie with expired date to delete it
  const expiredCookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;
  setDocumentCookie(expiredCookie);
}
