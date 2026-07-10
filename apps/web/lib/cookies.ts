/**
 * Client-side cookie utilities with fallback for older browsers.
 *
 * The Cookie Store API (cookieStore) is not supported in older browsers
 * (e.g., Safari < 16.4, Firefox < 128). These utilities provide a fallback
 * to document.cookie for broader browser compatibility.
 */

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
